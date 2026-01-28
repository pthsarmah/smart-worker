import type { Job } from "bullmq";
import { Pool } from "pg";
import { dbConfig, appConfig } from "./config";
import { logger, logDatabase } from "./logger";
import type {
    CategorizedEmbedding,
    ChunkedEmbedding,
    EmbeddingCategory,
    MemorySearchResult,
    MemorySearchResponse,
} from "./types";

export const dbPool = new Pool({
    host: dbConfig.host,
    user: dbConfig.user,
    port: dbConfig.port,
    password: dbConfig.password,
    database: dbConfig.database,
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    maxLifetimeSeconds: 60,
});

const createBaseTables = () => {
    logDatabase("createTables", { action: "job_failures_metadata" });

    dbPool
        .query(
            `CREATE TABLE IF NOT EXISTS job_failures_metadata (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL UNIQUE,
    job_name TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    job_data JSONB,
    job_opts JSONB,
    failed_reason TEXT,
    stacktrace TEXT,
    attempts_made INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER,
    retry_delay_ms INTEGER,
    timestamp_created TIMESTAMPTZ NOT NULL,
    timestamp_failed  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolution_summary TEXT,
    code_diff JSONB,
    CONSTRAINT uq_job_failure UNIQUE (queue_name, job_id)
	);`
        )
        .catch((e) => logger.error({ error: e }, "Error creating job_failures_metadata table"));

    dbPool
        .query(
            `CREATE TABLE IF NOT EXISTS job_failure_chunks (
    id BIGSERIAL PRIMARY KEY,
    job_failure_id BIGINT NOT NULL REFERENCES job_failures_metadata(job_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'code_context',
    weight REAL NOT NULL DEFAULT 1.0,
    content TEXT NOT NULL,
    embedding VECTOR(1024) NOT NULL
	);`
        )
        .catch((e) => logger.error({ error: e }, "Error creating job_failure_chunks table"));

    dbPool
        .query(
            `
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_lookup ON job_failures_metadata (queue_name, job_id);
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_failed_time ON job_failures_metadata (timestamp_failed DESC);
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_unresolved ON job_failures_metadata (resolved) WHERE resolved = false;
		CREATE INDEX IF NOT EXISTS idx_job_failure_chunks_category ON job_failure_chunks (category);
	`
        )
        .catch((e) => logger.error({ error: e }, "Error creating indexes"));
};

export const getTopKEmbeddings = async (
    embeddings: ChunkedEmbedding[],
    k: number = 5
) => {
    logDatabase("getTopKEmbeddings", { count: embeddings.length, k });

    const allRes = [];
    for (const emb of embeddings) {
        const res = await dbPool.query(
            `
		SELECT id, job_failure_id, content, embedding <=> $1 as distance FROM job_failure_chunks ORDER BY distance LIMIT 1;
		`,
            [`[${emb.embedding.join(",")}]`]
        );
        allRes.push(...res.rows.map((r) => ({ ...r, queryChunk: emb.content })));
    }

    const final = allRes.sort((a, b) => a.distance - b.distance).slice(0, k);

    return final;
};

export const getTopKCategorizedEmbeddings = async (
    embeddings: CategorizedEmbedding[],
    k: number = 5
): Promise<MemorySearchResponse> => {
    logDatabase("getTopKCategorizedEmbeddings", { count: embeddings.length, k });

    const allRes: MemorySearchResult[] = [];

    let signatureMatch = false;

    for (const emb of embeddings) {
        const res = await dbPool.query(
            `
			SELECT id, job_failure_id, content, category, weight, embedding <=> $1 as distance
			FROM job_failure_chunks
			WHERE category = $2
			ORDER BY distance
			LIMIT 3;
			`,
            [`[${emb.embedding.join(",")}]`, emb.category]
        );

        for (const row of res.rows) {
            const weightedDistance = row.distance / emb.weight;

            if (emb.category === "error_signature" && row.distance < 0.15) {
                signatureMatch = true;
            }

            allRes.push({
                ...row,
                weightedDistance,
                queryChunk: emb.content,
            });
        }
    }

    const final = allRes
        .sort((a, b) => a.weightedDistance - b.weightedDistance)
        .slice(0, k);

    return { results: final, signatureMatch };
};

export const insertFailedJobAndCategorizedEmbeddings = async (
    job: Job,
    resolved: boolean = false,
    resolutionSummary: string = "",
    embeddings: CategorizedEmbedding[]
) => {
    logDatabase("insertFailedJobAndCategorizedEmbeddings", {
        jobId: job.id,
        resolved,
        embeddingCount: embeddings.length,
    });

    dbPool
        .query(
            `INSERT INTO job_failures_metadata (
      job_id,
      job_name,
      queue_name,
      job_data,
      job_opts,
      failed_reason,
      stacktrace,
      attempts_made,
      max_attempts,
      retry_delay_ms,
      timestamp_created,
			resolved,
			resolution_summary
   ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
			$12, $13
   ) RETURNING id`,
            [
                parseInt(job.id!),
                job.name,
                job.queueName,
                job.data ?? null,
                job.opts ?? null,
                job.failedReason ?? null,
                Array.isArray(job.stacktrace)
                    ? JSON.stringify(job.stacktrace.at(-1))
                    : null,
                job.attemptsMade ?? 0,
                job.opts?.attempts ?? null,
                job.opts?.delay ?? null,
                new Date(job.timestamp),
                resolved,
                resolutionSummary,
            ]
        )
        .then((_) => {
            for (let i = 0; i < embeddings.length; i++) {
                const emb = embeddings[i];
                dbPool
                    .query(
                        `INSERT INTO job_failure_chunks
         (job_failure_id, chunk_index, category, weight, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            job.id!,
                            emb?.chunkId,
                            emb?.category,
                            emb?.weight,
                            emb?.content,
                            `[${emb?.embedding.join(",")}]`,
                        ]
                    )
                    .catch((e) =>
                        logger.error({ error: e, chunkIndex: i }, "Error inserting chunk")
                    );
            }
        })
        .catch((e) => logger.error({ error: e }, "Error inserting job"));
};

export const insertFailedJobAndChunkedEmbeddings = async (
    job: Job,
    resolved: boolean = false,
    resolutionSummary: string = "",
    embeddings: ChunkedEmbedding[]
) => {
    logDatabase("insertFailedJobAndChunkedEmbeddings", {
        jobId: job.id,
        resolved,
        embeddingCount: embeddings.length,
    });

    dbPool
        .query(
            `INSERT INTO job_failures_metadata (
      job_id,
      job_name,
      queue_name,
      job_data,
      job_opts,
      failed_reason,
      stacktrace,
      attempts_made,
      max_attempts,
      retry_delay_ms,
      timestamp_created,
			resolved,
			resolution_summary
   ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
			$12, $13
   ) RETURNING id`,
            [
                parseInt(job.id!),
                job.name,
                job.queueName,
                job.data ?? null,
                job.opts ?? null,
                job.failedReason ?? null,
                Array.isArray(job.stacktrace)
                    ? JSON.stringify(job.stacktrace.at(-1))
                    : null,
                job.attemptsMade ?? 0,
                job.opts?.attempts ?? null,
                job.opts?.delay ?? null,
                new Date(job.timestamp),
                resolved,
                resolutionSummary,
            ]
        )
        .then((_) => {
            for (let i = 0; i < embeddings.length; i++) {
                const emb = embeddings[i];
                dbPool
                    .query(
                        `INSERT INTO job_failure_chunks
         (job_failure_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4)`,
                        [job.id!, emb?.chunkId, emb?.content, `[${emb?.embedding.join(",")}]`]
                    )
                    .catch((e) =>
                        logger.error({ error: e, chunkIndex: i }, "Error inserting chunk")
                    );
            }
        })
        .catch((e) => logger.error({ error: e }, "Error inserting job"));
};

export const getJobResolutionSummary = async (job_id: number) => {
    logDatabase("getJobResolutionSummary", { jobId: job_id });

    const summary = await dbPool.query(
        `
		SELECT resolution_summary AS summary from job_failures_metadata WHERE job_id = $1 LIMIT 1;
		`,
        [job_id]
    );

    return summary.rows[0]?.summary as string;
};

export const checkDatabaseConnection = async (): Promise<boolean> => {
    try {
        const result = await dbPool.query("SELECT 1");
        return result.rowCount === 1;
    } catch {
        return false;
    }
};

export const closeDatabasePool = async () => {
    logDatabase("closeDatabasePool");
    await dbPool.end();
};

if (appConfig.executionContext === "host") {
    createBaseTables();
}
