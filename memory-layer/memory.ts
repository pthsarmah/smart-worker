import type { Job, Queue } from "bullmq";
import { queueMap } from "../queues";

const extractJobMetadata = (job: Job) => ({
	jobId: job.id,
	jobName: job.name,
	jobQueue: job.queueQualifiedName,
	jobData: job.data,
	jobState: job.getState?.(),
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
});

const extractEnvironmentMetadata = () => {
	const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.includes("APP")));
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

export const storeJobToMemory = (job: Job, sourceCodes: { path: string, code: string }[]) => {
	const jobMetadata = extractJobMetadata(job);
	const queue = queueMap[job.queueName];
	const queueMetadata = extractQueueMetadata(queue);

	const env = extractEnvironmentMetadata();
	const content = JSON.stringify(
		{
			job: jobMetadata,
			sourceCodes,
			queue: queueMetadata,
			env,
		}
	);

	content.replace(/\s+/g, '\s').trim();

	Bun.write(
		"metadata.txt",
		content
	);
}
