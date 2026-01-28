import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { z } from "zod";

// We need to test the schema validation directly since the config module
// immediately validates and exits on failure
const envSchema = z.object({
    APP_DB_HOST: z.string().min(1, "Database host is required"),
    APP_DB_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().positive()),
    APP_DB_USER: z.string().min(1, "Database user is required"),
    APP_DB_PASSWORD: z.string().min(1, "Database password is required"),
    APP_DB_NAME: z.string().min(1, "Database name is required"),
    APP_REDIS_HOST: z.string().default("localhost"),
    APP_REDIS_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().positive())
        .default("6379"),
    APP_SMTP_HOST: z.string().optional(),
    APP_SMTP_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().positive())
        .optional(),
    APP_SMTP_USER: z.string().optional(),
    APP_SMTP_PASS: z.string().optional(),
    APP_SMTP_TO_USER: z.string().optional(),
    APP_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().positive())
        .default("9090"),
    APP_ROOT_DIR: z.string().optional(),
    EXECUTION_CONTEXT: z.enum(["host", "sandbox"]).default("host"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    AI_SERVICE_URL: z.string().url().default("http://localhost:8100"),
    AI_MODEL_NAME: z.string().default("qwen2.5-coder-3b-instruct-q4_k_m.gguf"),
    AI_EMBEDDING_URL: z.string().url().default("http://localhost:8110"),
    AI_EMBEDDING_MODEL: z.string().default("bge-large-en-v1.5-f32"),
});

describe("Config Schema Validation", () => {
    const validEnv = {
        APP_DB_HOST: "localhost",
        APP_DB_PORT: "5432",
        APP_DB_USER: "testuser",
        APP_DB_PASSWORD: "testpass",
        APP_DB_NAME: "testdb",
    };

    test("validates minimal required config", () => {
        const result = envSchema.safeParse(validEnv);
        expect(result.success).toBe(true);
    });

    test("applies default values", () => {
        const result = envSchema.safeParse(validEnv);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.APP_REDIS_HOST).toBe("localhost");
            // Note: default values for ports come from the schema defaults
            // which may be strings before transformation
            expect(result.data.EXECUTION_CONTEXT).toBe("host");
            expect(result.data.NODE_ENV).toBe("development");
            expect(result.data.AI_SERVICE_URL).toBe("http://localhost:8100");
        }
    });

    test("fails when APP_DB_HOST is missing", () => {
        const { APP_DB_HOST, ...envWithoutHost } = validEnv;
        const result = envSchema.safeParse(envWithoutHost);
        expect(result.success).toBe(false);
    });

    test("fails when APP_DB_PORT is invalid", () => {
        const result = envSchema.safeParse({
            ...validEnv,
            APP_DB_PORT: "not-a-number",
        });
        expect(result.success).toBe(false);
    });

    test("fails when APP_DB_PORT is negative", () => {
        const result = envSchema.safeParse({
            ...validEnv,
            APP_DB_PORT: "-1",
        });
        expect(result.success).toBe(false);
    });

    test("validates EXECUTION_CONTEXT enum", () => {
        const hostResult = envSchema.safeParse({
            ...validEnv,
            EXECUTION_CONTEXT: "host",
        });
        expect(hostResult.success).toBe(true);

        const sandboxResult = envSchema.safeParse({
            ...validEnv,
            EXECUTION_CONTEXT: "sandbox",
        });
        expect(sandboxResult.success).toBe(true);

        const invalidResult = envSchema.safeParse({
            ...validEnv,
            EXECUTION_CONTEXT: "invalid",
        });
        expect(invalidResult.success).toBe(false);
    });

    test("validates NODE_ENV enum", () => {
        const devResult = envSchema.safeParse({
            ...validEnv,
            NODE_ENV: "development",
        });
        expect(devResult.success).toBe(true);

        const prodResult = envSchema.safeParse({
            ...validEnv,
            NODE_ENV: "production",
        });
        expect(prodResult.success).toBe(true);

        const testResult = envSchema.safeParse({
            ...validEnv,
            NODE_ENV: "test",
        });
        expect(testResult.success).toBe(true);

        const invalidResult = envSchema.safeParse({
            ...validEnv,
            NODE_ENV: "staging",
        });
        expect(invalidResult.success).toBe(false);
    });

    test("validates AI_SERVICE_URL is a valid URL", () => {
        const validUrlResult = envSchema.safeParse({
            ...validEnv,
            AI_SERVICE_URL: "http://ai-service:8100",
        });
        expect(validUrlResult.success).toBe(true);

        const invalidUrlResult = envSchema.safeParse({
            ...validEnv,
            AI_SERVICE_URL: "not-a-url",
        });
        expect(invalidUrlResult.success).toBe(false);
    });

    test("allows optional SMTP config to be omitted", () => {
        const result = envSchema.safeParse(validEnv);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.APP_SMTP_HOST).toBeUndefined();
            expect(result.data.APP_SMTP_PORT).toBeUndefined();
        }
    });

    test("accepts full SMTP config", () => {
        const result = envSchema.safeParse({
            ...validEnv,
            APP_SMTP_HOST: "smtp.example.com",
            APP_SMTP_PORT: "587",
            APP_SMTP_USER: "user@example.com",
            APP_SMTP_PASS: "password",
            APP_SMTP_TO_USER: "recipient@example.com",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.APP_SMTP_HOST).toBe("smtp.example.com");
            expect(result.data.APP_SMTP_PORT).toBe(587);
        }
    });

    test("transforms string ports to numbers", () => {
        const result = envSchema.safeParse({
            ...validEnv,
            APP_PORT: "3000",
            APP_REDIS_PORT: "6380",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(typeof result.data.APP_PORT).toBe("number");
            expect(result.data.APP_PORT).toBe(3000);
            expect(typeof result.data.APP_REDIS_PORT).toBe("number");
            expect(result.data.APP_REDIS_PORT).toBe(6380);
        }
    });
});
