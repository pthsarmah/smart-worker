import { z } from "zod";

const envSchema = z.object({
    // Database configuration
    APP_DB_HOST: z.string().min(1, "Database host is required"),
    APP_DB_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()),
    APP_DB_USER: z.string().min(1, "Database user is required"),
    APP_DB_PASSWORD: z.string().min(1, "Database password is required"),
    APP_DB_NAME: z.string().min(1, "Database name is required"),

    // Redis configuration
    APP_REDIS_HOST: z.string().default("localhost"),
    APP_REDIS_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default("6379"),

    // SMTP configuration (optional - emails will be disabled if not provided)
    APP_SMTP_HOST: z.string().optional(),
    APP_SMTP_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).optional(),
    APP_SMTP_USER: z.string().optional(),
    APP_SMTP_PASS: z.string().optional(),
    APP_SMTP_TO_USER: z.string().optional(),

    // Application configuration
    APP_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default("9090"),
    APP_ROOT_DIR: z.string().optional(),
    EXECUTION_CONTEXT: z.enum(["host", "sandbox"]).default("host"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // AI service configuration
    AI_SERVICE_URL: z.string().url().default("http://localhost:8100"),
    AI_MODEL_NAME: z.string().default("qwen2.5-coder-3b-instruct-q4_k_m.gguf"),
    AI_EMBEDDING_URL: z.string().url().default("http://localhost:8110"),
    AI_EMBEDDING_MODEL: z.string().default("bge-large-en-v1.5-f32"),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Configuration validation failed:");
        for (const issue of result.error.issues) {
            console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
        }
        process.exit(1);
    }

    return result.data;
}

export const config = loadConfig();

// Derived configuration objects for convenience
export const dbConfig = {
    host: config.APP_DB_HOST,
    port: config.APP_DB_PORT,
    user: config.APP_DB_USER,
    password: config.APP_DB_PASSWORD,
    database: config.APP_DB_NAME,
};

export const redisConfig = {
    host: config.APP_REDIS_HOST,
    port: config.APP_REDIS_PORT,
};

export const smtpConfig = {
    host: config.APP_SMTP_HOST,
    port: config.APP_SMTP_PORT,
    user: config.APP_SMTP_USER,
    pass: config.APP_SMTP_PASS,
    toUser: config.APP_SMTP_TO_USER,
    isConfigured: Boolean(
        config.APP_SMTP_HOST &&
        config.APP_SMTP_PORT &&
        config.APP_SMTP_USER &&
        config.APP_SMTP_PASS &&
        config.APP_SMTP_TO_USER
    ),
};

export const aiConfig = {
    serviceUrl: config.AI_SERVICE_URL,
    modelName: config.AI_MODEL_NAME,
    embeddingUrl: config.AI_EMBEDDING_URL,
    embeddingModel: config.AI_EMBEDDING_MODEL,
};

export const appConfig = {
    port: config.APP_PORT,
    rootDir: config.APP_ROOT_DIR,
    executionContext: config.EXECUTION_CONTEXT,
    nodeEnv: config.NODE_ENV,
    isDevelopment: config.NODE_ENV === "development",
    isProduction: config.NODE_ENV === "production",
    isTest: config.NODE_ENV === "test",
};
