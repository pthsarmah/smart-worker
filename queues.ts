import { Queue, QueueEvents } from "bullmq";
import { connection } from "./redis";
import { redisConfig } from "./config";

export const loginQueue = new Queue("login", {
    connection: connection,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

export const loginSandboxQueue = new Queue("login-sandbox", {
    connection: connection,
    defaultJobOptions: {
        attempts: 1,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: true,
    },
});

export const loginDLQ = new Queue("login-dlq", {
    connection: connection,
    defaultJobOptions: {
        removeOnComplete: true,
    },
});

export const loginQueueEvents = new QueueEvents("login", {
    connection: {
        host: redisConfig.host,
        port: redisConfig.port,
    },
});

export const queueMap: Record<string, Queue> = {
    login: loginQueue,
};
