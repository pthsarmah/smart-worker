import type { Job } from 'bullmq';
import { Pool } from 'pg';

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
	dbPool.query(`CREATE TABLE IF NOT EXISTS job_failures (
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
    embedding VECTOR(1536),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolution_summary TEXT,
    code_diff JSONB,
    CONSTRAINT uq_job_failure UNIQUE (queue_name, job_id)
	);`)
		.catch(e => console.log("Error creating tables", e));

	dbPool.query(`
		CREATE INDEX IF NOT EXISTS idx_job_failures_lookup ON job_failures (queue_name, job_id);
		CREATE INDEX IF NOT EXISTS idx_job_failures_failed_time ON job_failures (timestamp_failed DESC);
		CREATE INDEX IF NOT EXISTS idx_job_failures_unresolved ON job_failures (resolved) WHERE resolved = false;
	`)
		.catch(e => console.log("Error creating tables", e));
}

export const insertFailedJob = async (job: Job) => {

	dbPool.query(
		`INSERT INTO job_failures (
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
      timestamp_created
   ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11
   )`,
		[
			String(job.id),
			job.name,
			job.queueName,
			job.data ?? null,
			job.opts ?? null,
			job.failedReason ?? null,
			Array.isArray(job.stacktrace) ? job.stacktrace.at(-1) : null,
			job.attemptsMade ?? 0,
			job.opts?.attempts ?? null,
			job.opts?.delay ?? null,
			new Date(job.timestamp)
		]
	).catch(e => console.error("Error inserting job: ", e));

}

if (process.env.EXECUTION_CONTEXT === "host")
	createBaseTables();
