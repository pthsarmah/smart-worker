import { Worker } from "bullmq";
import { connection } from "../redis";
import { jobFailureReasoning } from "../reasoning-layer/reasoning";
import { loginDLQ, loginQueue } from "../queues";
import { createWorkerLogger, logJobProcessing, logJobSuccess, logJobFailure } from "../logger";
import type { WorkerJobData } from "../types";

const workerLogger = createWorkerLogger("login");

export const loginWorker = new Worker<WorkerJobData>(
    "login",
    async (job) => {
        logJobProcessing(job.id, "login", `Processing job ${job.id}`);

        // Actual business logic goes here
        // This is the clean production worker - add your job processing logic

        logJobSuccess(job.id, "login");
    },
    { connection }
);

loginWorker.on("failed", async (job) => {
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

loginWorker.on("completed", (job) => {
    logJobProcessing(job.id, "login", `Job ${job.id} completed`);
});

loginWorker.on("error", (error) => {
    workerLogger.error({ error }, "Worker error");
});

export default loginWorker;
