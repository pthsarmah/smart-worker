import { Redis } from "ioredis";
import { redisConfig } from "./config";
import { logger } from "./logger";

export const connection = new Redis({
    port: redisConfig.port,
    host: redisConfig.host,
    maxRetriesPerRequest: null,
});

connection.on("connect", () => {
    logger.info({ host: redisConfig.host, port: redisConfig.port }, "Redis connected");
});

connection.on("error", (error) => {
    logger.error({ error }, "Redis connection error");
});

export const checkRedisConnection = async (): Promise<boolean> => {
    try {
        const result = await connection.ping();
        return result === "PONG";
    } catch {
        return false;
    }
};

export const closeRedisConnection = async () => {
    logger.info("Closing Redis connection");
    await connection.quit();
};
