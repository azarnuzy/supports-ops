import type { TelemetryConfig, TelemetryExporter } from "@repo/logger/telemetry";
import { z } from "zod";

const runtimeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");
const telemetryExporterSchema = z.enum(["console", "otlp"]).default("console");
const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const emailFromSchema = z.string().trim().min(1).default("SupportOps <support@example.com>");
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:15432/supportops?schema=public";
const defaultEmbeddingModel = "openai/text-embedding-3-small";
const defaultFastModel = "openai/gpt-4.1-nano";
export const modelGatewayBaseUrl = "https://openrouter.ai/api/v1";
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

const workerEnvSchema = z.object({
  NODE_ENV: runtimeEnvSchema,
  DATABASE_URL: z.string().trim().min(1).default(defaultDatabaseUrl),
  EMBEDDING_MODEL: z.string().trim().min(1).default(defaultEmbeddingModel),
  ENABLE_TELEMETRY: booleanSchema.default(false),
  LOG_LEVEL: logLevelSchema,
  LLM_MODEL_FAST: z.string().trim().min(1).default(defaultFastModel),
  OPENROUTER_API_KEY: optionalStringSchema,
  MISTRAL_API_KEY: optionalStringSchema,
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:16379"),
  EMAIL_FROM: emailFromSchema,
  API_INTERNAL_URL: z.string().trim().url().default("http://localhost:8000"),
  INTERNAL_WORKER_TOKEN: optionalStringSchema,
  RESEND_API_KEY: optionalStringSchema,
  S3_ACCESS_KEY_ID: optionalStringSchema,
  S3_BUCKET: z.string().trim().min(1).default("supportops"),
  S3_ENDPOINT: optionalStringSchema,
  S3_FORCE_PATH_STYLE: booleanSchema.default(true),
  S3_PUBLIC_BASE_URL: optionalStringSchema,
  S3_REGION: z.string().trim().min(1).default("auto"),
  S3_SECRET_ACCESS_KEY: optionalStringSchema,
  TAVILY_API_KEY: optionalStringSchema,
  SMTP_URL: optionalStringSchema,
  TELEMETRY_API_KEY: optionalStringSchema,
  TELEMETRY_API_KEY_HEADER: z.string().trim().min(1).default("authorization"),
  TELEMETRY_EXPORTER: telemetryExporterSchema,
  TELEMETRY_EXPORTER_OTLP_ENDPOINT: optionalStringSchema,
  TELEMETRY_SERVICE_NAMESPACE: optionalStringSchema,
});

export function parseWorkerEnv(environment: NodeJS.ProcessEnv) {
  return workerEnvSchema.parse(environment);
}

export const env = parseWorkerEnv(process.env);

export const redisConfig = {
  url: env.REDIS_URL,
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

export const ingestionConfig = {
  mistralApiKey: env.MISTRAL_API_KEY,
  tavilyApiKey: env.TAVILY_API_KEY,
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

export const emailConfig = {
  from: env.EMAIL_FROM,
  // Development mail must stay inside Mailpit even if a developer also has
  // production Resend credentials in their local environment.
  resendApiKey: env.NODE_ENV === "production" ? env.RESEND_API_KEY : undefined,
  smtpUrl: env.SMTP_URL ?? (env.NODE_ENV === "production" ? undefined : "smtp://localhost:1025"),
} as const;

export const apiConfig = {
  internalUrl: env.API_INTERNAL_URL,
  workerToken: env.INTERNAL_WORKER_TOKEN,
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
