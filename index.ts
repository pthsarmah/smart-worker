import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { loginQueue, loginQueueEvents, loginDLQ } from "./queues";
import { appConfig } from "./config";
import { logger } from "./logger";
import { checkRedisConnection, closeRedisConnection, connection } from "./redis";
import { checkDatabaseConnection, closeDatabasePool } from "./sql";
import { initializeWorkers } from "./workers";
import type {
    CreateJobResponse,
    HealthCheckResponse,
    DLQListResponse,
    DLQRetryResponse,
    DLQJob,
} from "./types";

import "./reasoning-layer/destroy-sandbox.ts";

const app = express();
app.use(express.json());

const port = appConfig.port;

// Swagger UI setup
try {
    const openApiPath = path.join(import.meta.dir, "docs", "openapi.yaml");
    if (fs.existsSync(openApiPath)) {
        const openApiDoc = YAML.parse(fs.readFileSync(openApiPath, "utf8"));
        app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDoc));
        logger.info("Swagger UI available at /docs");
    }
} catch (e) {
    logger.warn("OpenAPI documentation not available");
}

// Test job creation endpoint
app.get("/", async (_, res) => {
    const job = await loginQueue.add("start-worker", {
        num: 10,
        callfile: import.meta.path,
        reasoning_fix: true,
    });
    const response: CreateJobResponse = {
        jobId: job.id,
        status: "created",
    };
    res.status(202).json(response);
});

// Custom job creation endpoint
app.post("/job", async (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) {
        return res.status(400).json({ error: "Missing name or data" });
    }

    const newData = { ...data };
    newData["reasoning_fix"] = newData["reasoning_fix"] ? false : true;

    const job = await loginQueue.add(name, newData, {
        removeOnComplete: true,
        removeOnFail: true,
    });

    try {
        const result = await job.waitUntilFinished(loginQueueEvents);
        res.status(200).json({ success: true, result });
    } catch (error) {
        const freshJob = await loginQueue.getJob(job.id as string);
        res.status(200).json({ success: false, result: freshJob?.failedReason });
    }
});

// Health check endpoint
app.get("/health", async (_, res) => {
    const startTime = Date.now();

    const [redisOk, postgresOk] = await Promise.all([
        checkRedisConnection(),
        checkDatabaseConnection(),
    ]);

    const redisLatency = Date.now() - startTime;
    const postgresLatency = Date.now() - startTime;

    const isHealthy = redisOk && postgresOk;

    const response: HealthCheckResponse = {
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        services: {
            redis: {
                status: redisOk ? "up" : "down",
                latency: redisLatency,
                ...(redisOk ? {} : { error: "Connection failed" }),
            },
            postgres: {
                status: postgresOk ? "up" : "down",
                latency: postgresLatency,
                ...(postgresOk ? {} : { error: "Connection failed" }),
            },
        },
    };

    res.status(isHealthy ? 200 : 503).json(response);
});

// DLQ Management endpoints

// List jobs in DLQ with pagination
app.get("/dlq", async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    try {
        const jobs = await loginDLQ.getJobs(["waiting", "delayed", "active"], start, end);
        const total = await loginDLQ.count();

        const dlqJobs: DLQJob[] = jobs.map((job) => ({
            id: job.id!,
            name: job.name,
            data: job.data,
            failedReason: job.failedReason,
            timestamp: job.timestamp,
            attemptsMade: job.attemptsMade,
        }));

        const response: DLQListResponse = {
            jobs: dlqJobs,
            total,
            page,
            pageSize,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error({ error }, "Error listing DLQ jobs");
        res.status(500).json({ error: "Failed to list DLQ jobs" });
    }
});

// Retry a specific job from DLQ
app.post("/dlq/:jobId/retry", async (req, res) => {
    const { jobId } = req.params;

    try {
        const job = await loginDLQ.getJob(jobId);

        if (!job) {
            return res.status(404).json({ success: false, error: "Job not found in DLQ" });
        }

        // Add job back to main queue
        const newJob = await loginQueue.add(job.name, job.data, {
            ...job.opts,
            attempts: (job.opts.attempts ?? 1) + 1,
        });

        // Remove from DLQ
        await job.remove();

        const response: DLQRetryResponse = {
            success: true,
            newJobId: newJob.id,
        };

        logger.info({ oldJobId: jobId, newJobId: newJob.id }, "Job retried from DLQ");
        res.status(200).json(response);
    } catch (error) {
        logger.error({ error, jobId }, "Error retrying job from DLQ");
        res.status(500).json({ success: false, error: "Failed to retry job" });
    }
});

// Clear all jobs from DLQ
app.delete("/dlq", async (_, res) => {
    try {
        await loginDLQ.obliterate({ force: true });
        logger.info("DLQ cleared");
        res.status(200).json({ success: true, message: "DLQ cleared" });
    } catch (error) {
        logger.error({ error }, "Error clearing DLQ");
        res.status(500).json({ success: false, error: "Failed to clear DLQ" });
    }
});

// Remove specific job from DLQ
app.delete("/dlq/:jobId", async (req, res) => {
    const { jobId } = req.params;

    try {
        const job = await loginDLQ.getJob(jobId);

        if (!job) {
            return res.status(404).json({ success: false, error: "Job not found in DLQ" });
        }

        await job.remove();
        logger.info({ jobId }, "Job removed from DLQ");
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ error, jobId }, "Error removing job from DLQ");
        res.status(500).json({ success: false, error: "Failed to remove job from DLQ" });
    }
});

// Server instance for graceful shutdown
const server = app.listen(port, "0.0.0.0", async () => {
    logger.info({ port }, "Server listening");

    // Initialize workers
    await initializeWorkers();
});

// Graceful shutdown handling
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
        logger.warn("Shutdown already in progress");
        return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Graceful shutdown initiated");

    // Stop accepting new connections
    server.close((err) => {
        if (err) {
            logger.error({ error: err }, "Error closing server");
        } else {
            logger.info("HTTP server closed");
        }
    });

    try {
        // Close queue event listeners
        await loginQueueEvents.close();
        logger.info("Queue events closed");

        // Close Redis connection
        await closeRedisConnection();

        // Close database pool
        await closeDatabasePool();

        logger.info("Graceful shutdown complete");
        process.exit(0);
    } catch (error) {
        logger.error({ error }, "Error during graceful shutdown");
        process.exit(1);
    }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled rejection");
});
