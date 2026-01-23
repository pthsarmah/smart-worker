import type { Job } from 'bullmq';
import { Pool } from 'pg';
import type { ChunkedEmbedding } from './reasoning-layer/types';

const dbPool = new Pool({
	host: process.env.APP_DB_HOST!,
	user: process.env.APP_DB_USER!,
	port: parseInt(process.env.APP_DB_PORT!),
	password: process.env.APP_DB_PASSWORD!,
	database: process.env.APP_DB_NAME!,
	max: 1,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
	maxLifetimeSeconds: 60,
});

const createBaseTables = () => {
	dbPool.query(`CREATE TABLE IF NOT EXISTS job_failures_metadata (
    id BIGSERIAL PRIMARY KEY,
    job_id TEXT NOT NULL,
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
	);`)
		.catch(e => console.log("Error creating tables", e));

	dbPool.query(`CREATE TABLE IF NOT EXISTS job_failure_chunks (
    id BIGSERIAL PRIMARY KEY,
    job_failure_id BIGINT NOT NULL REFERENCES job_failures_metadata(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL
	);`)
		.catch(e => console.log("Error creating tables", e));

	dbPool.query(`
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_lookup ON job_failures_metadata (queue_name, job_id);
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_failed_time ON job_failures_metadata (timestamp_failed DESC);
		CREATE INDEX IF NOT EXISTS idx_job_failures_metadata_unresolved ON job_failures_metadata (resolved) WHERE resolved = false;
	`)
		.catch(e => console.log("Error creating tables", e));
}

export const getTopKEmbeddings = async (embeddings: ChunkedEmbedding[], k: number = 5) => {

	const allRes = [];
	for (const emb of embeddings) {
		const res = await dbPool.query(
			`
		SELECT id, content, embedding <=> $1 as distance FROM job_failure_chunks ORDER BY distance LIMIT $2
		`,
			[`[${emb.embedding.join(",")}]`, k]
		);
		allRes.push(...res.rows)
	}

	const best = new Map();

	for (const row of allRes) {
		const prev = best.get(row.id);
		if (!prev || row.distance < prev.distance) {
			best.set(row.id, row);
		}
	}

	const final = [...best.values()]
		.sort((a, b) => a.distance - b.distance)
		.slice(0, k);

	return final;
}

export const insertFailedJobAndChunkedEmbeddings = async (job: Job, resolved: boolean = false, resolutionSummary: string = "", embeddings: ChunkedEmbedding[]) => {

	dbPool.query(
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
			String(job.id),
			job.name,
			job.queueName,
			job.data ?? null,
			job.opts ?? null,
			job.failedReason ?? null,
			Array.isArray(job.stacktrace) ? JSON.stringify(job.stacktrace.at(-1)) : null,
			job.attemptsMade ?? 0,
			job.opts?.attempts ?? null,
			job.opts?.delay ?? null,
			new Date(job.timestamp),
			resolved,
			resolutionSummary,
		]
	)
		.then(s => {
			let jobFailureId = parseInt(s.rows[0].id);
			for (let i = 0; i < embeddings.length; i++) {
				const emb = embeddings[i];
				dbPool.query(
					`INSERT INTO job_failure_chunks
         (job_failure_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4)`,
					[
						jobFailureId,
						emb?.chunkId,
						emb?.content,
						`[${emb?.embedding[0].join(',')}]`,
					]
				)
					.catch(e => console.error(`Error inserting chunk ${i}`, e));
			}

		})
		.catch(e => console.error("Error inserting job: ", e));
}

if (process.env.EXECUTION_CONTEXT === "host")
	createBaseTables();
