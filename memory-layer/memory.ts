import type { Job, Queue } from "bullmq";
import { queueMap } from "../queues";
import { insertFailedJobAndChunkedEmbeddings } from "../sql";
import { startSpinner } from "../utils";
import type { ChunkedEmbedding } from "../reasoning-layer/types";

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


const chunkText = (text: string, maxChars = 800, overlap = 200) => {
	const chunks: string[] = [];
	let start = 0;

	while (start < text.length) {
		const end = start + maxChars;
		chunks.push(text.slice(start, end));
		start = end - overlap;
		if (start < 0) start = 0;
	}

	return chunks;
}

const generateEmbeddings = async (jobId: string, text: string) => {

	const chunks = chunkText(text);
	let allEmbeddings: ChunkedEmbedding[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const response = await fetch(`http://localhost:8110/embedding`, {
			method: "POST",
			body: JSON.stringify({
				content: chunks[i],
				encoding_format: "float",
				model: "all-MiniLM-L6-v2",
			}),
		});

		if (!response.ok) {
			const err = await response.text();
			console.error("Error in embedding text: ", err)
		}

		const embeddings: any = await response.json();
		const emb: any[] = embeddings[0].embedding;

		allEmbeddings.push({
			chunkId: i,
			content: chunks[i] ?? "",
			embedding: emb
		});
	}

	return allEmbeddings;
}

export const storeJobToMemory = async (job: Job, codeContext: string, resolved: boolean, resolutionSummary: string) => {

	const stopSpinner = startSpinner("Storing failed job in memory...");

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

	const embeddings = await generateEmbeddings(job.id!, embeddingText);

	await insertFailedJobAndChunkedEmbeddings(job, resolved, resolutionSummary, embeddings);

	stopSpinner();
}
