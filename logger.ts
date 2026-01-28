import pino from "pino";
import { appConfig } from "./config";

const transport = appConfig.isDevelopment
    ? {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
        },
    }
    : undefined;

export const logger = pino({
    level: appConfig.isProduction ? "info" : "debug",
    transport,
    base: {
        env: appConfig.nodeEnv,
    },
});

// Create child loggers with context
export const createJobLogger = (jobId: string | undefined, queueName?: string) => {
    return logger.child({
        jobId,
        queueName,
    });
};

export const createRequestLogger = (requestId: string) => {
    return logger.child({
        requestId,
    });
};

export const createWorkerLogger = (workerName: string) => {
    return logger.child({
        worker: workerName,
    });
};

// Convenience methods for common log patterns
export const logJobProcessing = (jobId: string | undefined, queueName: string, message: string) => {
    const jobLogger = createJobLogger(jobId, queueName);
    jobLogger.info(message);
};

export const logJobSuccess = (jobId: string | undefined, queueName: string) => {
    const jobLogger = createJobLogger(jobId, queueName);
    jobLogger.info("Job completed successfully");
};

export const logJobFailure = (jobId: string | undefined, queueName: string, error: Error | string) => {
    const jobLogger = createJobLogger(jobId, queueName);
    jobLogger.error({ error: error instanceof Error ? error.message : error }, "Job failed");
};

export const logAIInteraction = (action: string, details?: Record<string, unknown>) => {
    logger.info({ component: "ai", action, ...details }, `AI: ${action}`);
};

export const logSandbox = (action: string, jobId?: string, details?: Record<string, unknown>) => {
    logger.info({ component: "sandbox", jobId, action, ...details }, `Sandbox: ${action}`);
};

export const logMemory = (action: string, details?: Record<string, unknown>) => {
    logger.info({ component: "memory", action, ...details }, `Memory: ${action}`);
};

export const logDatabase = (action: string, details?: Record<string, unknown>) => {
    logger.debug({ component: "database", action, ...details }, `Database: ${action}`);
};

export default logger;
