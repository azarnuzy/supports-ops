import type { TelemetryConfig, TelemetryExporter } from "@repo/logger/telemetry";
import { z } from "zod";

export type RuntimeEnv = "development" | "test" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

const defaultClientOrigins = "http://localhost:3000,http://localhost:4000";
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:15432/supportops?schema=public";
const defaultBetterAuthUrl = "http://localhost:8000";
const defaultBetterAuthSecret = "dev-change-me";
const productionSecretMinimumLength = 32;
const defaultEmbeddingModel = "openai/text-embedding-3-small";
const defaultFastModel = "openai/gpt-4.1-nano";
const defaultMainModel = "openai/gpt-4o-mini";
export const modelGatewayBaseUrl = "https://openrouter.ai/api/v1";

const runtimeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");
const telemetryExporterSchema = z.enum(["console", "otlp"]).default("console");
const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return value;
}, z.boolean());

const apiEnvSchema = z
  .object({
    NODE_ENV: runtimeEnvSchema,
    API_PORT: z.coerce.number().int().positive().default(8000),
    AUTH_SECRET: optionalStringSchema,
    BETTER_AUTH_SECRET: optionalStringSchema,
    BETTER_AUTH_URL: z.string().trim().url().default(defaultBetterAuthUrl),
    BUSINESS_SYSTEM_URL: z.string().trim().url().default("http://localhost:8001"),
    CLIENT_ORIGINS: z.string().trim().min(1).default(defaultClientOrigins),
    DATABASE_URL: z.string().trim().min(1).default(defaultDatabaseUrl),
    EMBEDDING_MODEL: z.string().trim().min(1).default(defaultEmbeddingModel),
    ENABLE_TELEMETRY: booleanSchema.default(false),
    LLM_MODEL_FAST: z.string().trim().min(1).default(defaultFastModel),
    LLM_MODEL_MAIN: z.string().trim().min(1).default(defaultMainModel),
    INTERNAL_WORKER_TOKEN: optionalStringSchema,
    LOG_LEVEL: logLevelSchema,
    OPENROUTER_API_KEY: optionalStringSchema,
    S3_ACCESS_KEY_ID: optionalStringSchema,
    S3_BUCKET: z.string().trim().min(1).default("supportops"),
    S3_ENDPOINT: optionalStringSchema,
    S3_FORCE_PATH_STYLE: booleanSchema.default(true),
    S3_PUBLIC_BASE_URL: optionalStringSchema,
    S3_REGION: z.string().trim().min(1).default("auto"),
    S3_SECRET_ACCESS_KEY: optionalStringSchema,
    TELEMETRY_API_KEY: optionalStringSchema,
    TELEMETRY_API_KEY_HEADER: z.string().trim().min(1).default("authorization"),
    TELEMETRY_EXPORTER: telemetryExporterSchema,
    TELEMETRY_EXPORTER_OTLP_ENDPOINT: optionalStringSchema,
    TELEMETRY_SERVICE_NAMESPACE: optionalStringSchema,
    TOOL_MASTER_KEY: optionalStringSchema,
  })
  .superRefine((env, context) => {
    const betterAuthSecret = env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET ?? defaultBetterAuthSecret;

    if (env.NODE_ENV !== "production") {
      return;
    }

    if (betterAuthSecret === defaultBetterAuthSecret) {
      context.addIssue({
        code: "custom",
        message: "BETTER_AUTH_SECRET must be changed in production.",
        path: ["BETTER_AUTH_SECRET"],
      });
    }

    if (betterAuthSecret.length < productionSecretMinimumLength) {
      context.addIssue({
        code: "custom",
        message: `BETTER_AUTH_SECRET must be at least ${productionSecretMinimumLength} characters in production.`,
        path: ["BETTER_AUTH_SECRET"],
      });
    }
  });

export function parseApiEnv(environment: NodeJS.ProcessEnv) {
  return apiEnvSchema.parse(environment);
}

export const env = parseApiEnv(process.env);

export const appConfig = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
} as const;

export const apiConfig = {
  businessSystemUrl: env.BUSINESS_SYSTEM_URL,
  internalWorkerToken: env.INTERNAL_WORKER_TOKEN,
  port: env.API_PORT,
  clientOrigins: parseCsv(env.CLIENT_ORIGINS),
} as const;

export const betterAuthConfig = {
  secret: env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET ?? defaultBetterAuthSecret,
  trustedOrigins: parseCsv(env.CLIENT_ORIGINS),
  url: env.BETTER_AUTH_URL,
} as const;

export const databaseConfig = {
  url: env.DATABASE_URL,
} as const;

export const embeddingConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  baseUrl: modelGatewayBaseUrl,
  modelId: env.EMBEDDING_MODEL,
} as const;

export const classificationConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  baseUrl: modelGatewayBaseUrl,
  modelId: env.LLM_MODEL_FAST,
} as const;

export const aiAgentConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  baseUrl: modelGatewayBaseUrl,
  modelId: env.LLM_MODEL_MAIN,
} as const;

export const toolEncryptionConfig = {
  get masterKey() {
    if (!env.TOOL_MASTER_KEY) {
      throw new Error("TOOL_MASTER_KEY is required to encrypt or decrypt Tool secrets.");
    }
    return env.TOOL_MASTER_KEY;
  },
} as const;

export const storageConfig = {
  accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
  bucket: env.S3_BUCKET,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  publicBaseUrl: env.S3_PUBLIC_BASE_URL,
  region: env.S3_REGION,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
} as const;

export const loggerConfig = {
  environment: env.NODE_ENV,
  level: env.LOG_LEVEL,
} as const;

export const telemetryConfig = {
  apiKey: env.TELEMETRY_API_KEY,
  apiKeyHeader: env.TELEMETRY_API_KEY_HEADER,
  enabled: env.ENABLE_TELEMETRY,
  environment: env.NODE_ENV,
  exporter: env.TELEMETRY_EXPORTER as TelemetryExporter,
  otlpEndpoint: env.TELEMETRY_EXPORTER_OTLP_ENDPOINT,
  serviceNamespace: env.TELEMETRY_SERVICE_NAMESPACE,
} satisfies TelemetryConfig;

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
