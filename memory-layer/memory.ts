import type { Job, Queue } from "bullmq";
import { queueMap } from "../queues";
import {
    getJobResolutionSummary,
    getTopKCategorizedEmbeddings,
    insertFailedJobAndCategorizedEmbeddings,
} from "../sql";
import { majorityVote, startSpinner } from "../utils";
import { logger, logMemory } from "../logger";
import { aiClient } from "../services/ai-client";
import type {
    CategorizedEmbedding,
    EmbeddingCategory,
    StructuredFailureContext,
    CATEGORY_WEIGHTS,
} from "../types";

const categoryWeights: Record<EmbeddingCategory, number> = {
    error_signature: 3.0,
    failure_location: 2.0,
    code_context: 1.0,
    metadata: 0.5,
};

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
    };
};

const extractEnvironmentMetadata = () => {
    const env = Object.fromEntries(
        Object.entries(process.env).filter(
            ([k]) => !k.includes("APP") && !k.includes("KEY") && !k.includes("TOKEN")
        )
    );
    return env;
};

const extractQueueMetadata = (queue: Queue | undefined) => {
    if (!queue) {
        return;
    }

    return {
        queueName: queue.name,
        queueJobOpts: queue.defaultJobOptions,
    };
};

const generateSingleEmbedding = async (text: string): Promise<number[]> => {
    try {
        return await aiClient.generateEmbedding(text);
    } catch (e) {
        logger.error({ error: e }, "Error generating embedding");
        return [];
    }
};

const generateCategorizedEmbeddings = async (
    structuredContext: StructuredFailureContext
): Promise<CategorizedEmbedding[]> => {
    const embeddings: CategorizedEmbedding[] = [];

    const errorSigText = `ERROR: ${structuredContext.errorSignature.errorType} - ${structuredContext.errorSignature.normalizedSignature}`;
    const errorSigEmb = await generateSingleEmbedding(errorSigText);
    if (errorSigEmb.length > 0) {
        embeddings.push({
            category: "error_signature",
            chunkId: 0,
            content: errorSigText,
            embedding: errorSigEmb,
            weight: categoryWeights.error_signature,
        });
    }

    for (let i = 0; i < structuredContext.focusedSnippets.length; i++) {
        const snippet = structuredContext.focusedSnippets[i];
        if (!snippet) continue;

        const locText = `FAILURE at ${snippet.filePath}:${snippet.failureLine}\n${snippet.content}`;
        const locEmb = await generateSingleEmbedding(locText);
        if (locEmb.length > 0) {
            embeddings.push({
                category: "failure_location",
                chunkId: i,
                content: locText,
                embedding: locEmb,
                weight: categoryWeights.failure_location,
            });
        }
    }

    const metadataText = `JOB: ${structuredContext.jobMetadata.name} DATA: ${JSON.stringify(structuredContext.jobMetadata.data)}`;
    const metadataEmb = await generateSingleEmbedding(metadataText);
    if (metadataEmb.length > 0) {
        embeddings.push({
            category: "metadata",
            chunkId: 0,
            content: metadataText,
            embedding: metadataEmb,
            weight: categoryWeights.metadata,
        });
    }

    return embeddings;
};

export const createEmbeddingText = async (job: Job, codeContext: string) => {
    const jobMetadata = await extractJobMetadata(job);
    const env = extractEnvironmentMetadata();
    const queue = queueMap[job.queueName];
    const queueMetadata = extractQueueMetadata(queue);

    const embeddingText = `
=======================
 JOB METADATA
=======================
\n${Object.entries(jobMetadata)
        .map(
            ([k, v]) =>
                `${k}: ${v instanceof Object ? JSON.stringify(v, null, 2) : v}`
        )
        .join("\n")}\n
=======================
 QUEUE METADATA
=======================
\n${Object.entries(queueMetadata!)
        .map(
            ([k, v]) =>
                `${k}: ${v instanceof Object ? JSON.stringify(v, null, 2) : v}`
        )
        .join("\n")}\n
=======================
 SOURCE CODES
=======================
\n${codeContext}\n
=======================
 ENVIRONMENT
=======================
\n${Object.entries(env)
        .map(
            ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v, null, 2) : v}`
        )
        .join("\n")}\n
`;

    return embeddingText;
};

export const searchJobFromMemory = async (
    structuredContext: StructuredFailureContext
) => {
    logMemory("search_start");

    const embeddings = await generateCategorizedEmbeddings(structuredContext);
    const { results: final, signatureMatch } = await getTopKCategorizedEmbeddings(
        embeddings,
        15
    );

    if (final.length === 0) {
        logMemory("search_no_results");
        return {
            electionResults: null,
            resolutionSummary: null,
            meanDistance: 1.0,
            signatureMatch: false,
        };
    }

    const distances = final.map((f) => f.weightedDistance);
    const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    const jobIds = final.map((f) => parseInt(f.job_failure_id));
    const electionResults = majorityVote(jobIds);

    if (!electionResults.winner) {
        logMemory("search_no_winner", { meanDistance });
        return { electionResults: null, resolutionSummary: null, meanDistance, signatureMatch };
    }

    const resolutionSummary = await getJobResolutionSummary(electionResults.winner);

    logMemory("search_complete", {
        winner: electionResults.winner,
        meanDistance,
        signatureMatch,
    });

    return { electionResults, resolutionSummary, meanDistance, signatureMatch };
};

export const storeJobToMemory = async (
    job: Job,
    structuredContext: StructuredFailureContext,
    resolved: boolean,
    resolutionSummary: string
) => {
    const stopSpinner = startSpinner("Storing failed job in memory...");

    const embeddings = await generateCategorizedEmbeddings(structuredContext);

    await insertFailedJobAndCategorizedEmbeddings(
        job,
        resolved,
        resolutionSummary,
        embeddings
    );

    stopSpinner();
    logMemory("store_complete", { jobId: job.id, resolved });
};
