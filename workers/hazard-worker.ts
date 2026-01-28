import { Worker } from "bullmq";
import { connection } from "../redis";
import { jobFailureReasoning } from "../reasoning-layer/reasoning";
import { loginDLQ, loginQueue } from "../queues";
import { createWorkerLogger, logJobProcessing, logJobSuccess, logJobFailure } from "../logger";
import type { WorkerJobData } from "../types";

const workerLogger = createWorkerLogger("hazard");

/**
 * Hazard Worker - For testing error handling and AI resolution
 *
 * This worker intentionally fails under certain conditions to test:
 * - Job data hazard: fails when job.data.num === 10
 * - Environment variable hazard: fails when TEST_ENV_VAR is not set
 *
 * Use this worker in development/testing to verify the AI resolution pipeline.
 */
export const hazardWorker = new Worker<WorkerJobData>(
    "login",
    async (job) => {
        logJobProcessing(job.id, "login", `Processing hazard test job ${job.id}`);

        // Job data hazard testing
        if (job.data.num === 10) {
            throw new Error(`Failed job ${job.id}: num === 10 hazard triggered`);
        }

        // Environment variable hazard testing
        if (!process.env.TEST_ENV_VAR) {
            throw new Error(`Failed job ${job.id}: TEST_ENV_VAR not set`);
        }

        logJobSuccess(job.id, "login");
    },
    { connection }
);

hazardWorker.on("failed", async (job) => {
    if (!job) return;

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts.attempts ?? 1;

    logJobFailure(job.id, "login", job.failedReason ?? "Unknown error");

    if (attemptsMade >= maxAttempts) {
        if (job.id) {
            await loginQueue.remove(job.id);
        }
        await loginDLQ.add(job.name, job.data, job.opts);

        if (job.data.reasoning_fix) {
            jobFailureReasoning(job)
                .then(() => {})
                .catch((e) => {
                    workerLogger.error({ error: e }, "Error in job failure reasoning");
                });
        } else {
            workerLogger.warn({ jobId: job.id }, "Job moved to DLQ without reasoning fix");
        }
    }
});

hazardWorker.on("completed", (job) => {
    logJobProcessing(job.id, "login", `Hazard test job ${job.id} completed`);
});

hazardWorker.on("error", (error) => {
    workerLogger.error({ error }, "Hazard worker error");
});

export default hazardWorker;
