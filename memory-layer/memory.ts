import type { Job, Queue } from "bullmq";
import { queueMap } from "../queues";
import { insertFailedJob } from "../sql";

const extractJobMetadata = async (job: Job) => {

	const jobState = await job.getState?.();

	return {
		jobId: job.id,
		jobName: job.name,
		jobQueue: job.queueQualifiedName,
		jobData: job.data,
		jobState: jobState,
		jobProgress: job.progress,
		jobAttemptsMade: job.attemptsMade,
		jobAttemptsStarted: job.attemptsStarted,
		jobMaxAttempts: job.opts?.attempts,
		jobPriority: job.priority,
		jobDelay: job.delay,
		jobEnqueuedAt: job.timestamp,
		jobProcessedAt: job.processedOn,
		jobFinishedAt: job.finishedOn,
		jobFailedReason: job.failedReason,
		jobStacktrace: job.stacktrace?.at(-1),
	}
};

const extractEnvironmentMetadata = () => {
	const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.includes("APP") && !k.includes("KEY") && !k.includes("TOKEN")));
	return env;
}

const extractQueueMetadata = (queue: Queue | undefined) => {

	if (!queue) {
		return;
	}

	return {
		queueName: queue.name,
		queueJobOpts: queue.defaultJobOptions,
	}
}

export const storeJobToMemory = async (job: Job, codeContext: string) => {

	console.log("\x1b[33m%s\x1b[0m", "> Storing failed job to memory...");

	const jobMetadata = await extractJobMetadata(job);
	const env = extractEnvironmentMetadata();
	const queue = queueMap[job.queueName];
	const queueMetadata = extractQueueMetadata(queue);

	const embeddingText = `
=======================
 JOB METADATA
=======================
\n${Object.entries(jobMetadata).map(([k, v]) => `${k}: ${v instanceof Object ? JSON.stringify(v, null, 2) : v}`).join("\n")}\n
=======================
 QUEUE METADATA
=======================
\n${Object.entries(queueMetadata!).map(([k, v]) => `${k}: ${v instanceof Object ? JSON.stringify(v, null, 2) : v}`).join("\n")}\n
=======================
 SOURCE CODES
=======================
\n${codeContext}\n
=======================
 ENVIRONMENT
=======================
\n${Object.entries(env).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v, null, 2) : v}`).join("\n")}\n
`;

	await insertFailedJob(job);
	return embeddingText;
}
