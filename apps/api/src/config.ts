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
/** Embeddings stay on OpenRouter: the vector store holds chunks embedded by
 * `EMBEDDING_MODEL`, so moving this provider would invalidate every stored
 * chunk and force a full re-ingest. Completions are free to move. */
export const embeddingGatewayBaseUrl = "https://openrouter.ai/api/v1";
/** Defaults to OpenRouter so an environment that only sets OPENROUTER_API_KEY
 * keeps working; .env.local points it at the Devscale gateway. */
const defaultCompletionGatewayBaseUrl = embeddingGatewayBaseUrl;

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
    // An unset var and one set to "" must mean the same thing: Compose passes
    // an empty string for an optional override, and z.coerce would read it as 0.
    LLM_MAIN_MAX_OUTPUT_TOKENS: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
    LLM_MAIN_REASONING_EFFORT: optionalStringSchema,
    INTERNAL_WORKER_TOKEN: optionalStringSchema,
    LOG_LEVEL: logLevelSchema,
    MAYAR_API_KEY: optionalStringSchema,
    // Sandbox by default; production sets https://api.mayar.id/hl/v2.
    MAYAR_API_URL: z.string().trim().url().default("https://api.mayar.io/hl/v2"),
    // Requests slower than this are logged with their duration. Compose passes
    // an empty string for an unset override, which z.coerce would read as 0.
    SLOW_REQUEST_MS: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.coerce.number().int().positive().default(500),
    ),
    OPENROUTER_API_KEY: optionalStringSchema,
    OPERATOR_AUTH_SECRET: optionalStringSchema,
    COMPLETION_GATEWAY_API_KEY: optionalStringSchema,
    EVAL_JUDGE_MODEL: optionalStringSchema,
    EVAL_WORKSPACE_ID: optionalStringSchema,
    COMPLETION_GATEWAY_BASE_URL: z.string().trim().url().default(defaultCompletionGatewayBaseUrl),
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
    ALLOW_LOCAL_HTTP_TOOLS: booleanSchema.default(false),
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

    if (!env.OPERATOR_AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        message: "OPERATOR_AUTH_SECRET must be set in production.",
        path: ["OPERATOR_AUTH_SECRET"],
      });
    } else if (env.OPERATOR_AUTH_SECRET.length < productionSecretMinimumLength) {
      context.addIssue({
        code: "custom",
        message: `OPERATOR_AUTH_SECRET must be at least ${productionSecretMinimumLength} characters in production.`,
        path: ["OPERATOR_AUTH_SECRET"],
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

export const operatorAuthConfig = {
  secret: env.OPERATOR_AUTH_SECRET ?? defaultBetterAuthSecret,
  trustedOrigins: parseCsv(env.CLIENT_ORIGINS),
  url: env.BETTER_AUTH_URL,
} as const;

export const databaseConfig = {
  url: env.DATABASE_URL,
} as const;

export const embeddingConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  baseUrl: embeddingGatewayBaseUrl,
  modelId: env.EMBEDDING_MODEL,
} as const;

export const classificationConfig = {
  apiKey: env.COMPLETION_GATEWAY_API_KEY ?? env.OPENROUTER_API_KEY,
  baseUrl: env.COMPLETION_GATEWAY_BASE_URL,
  modelId:
    new URL(env.COMPLETION_GATEWAY_BASE_URL).hostname === "gateway.devscale.id"
      ? env.LLM_MODEL_FAST.split("/").at(-1)!
      : env.LLM_MODEL_FAST,
} as const;

/** `maxOutputTokens` and `reasoningEffort` are the two knobs that move reply
 * latency: output tokens dominate generation time, and on this model roughly
 * half of them are reasoning. Both are unset by default, which leaves the
 * provider's own defaults in place — see
 * `docs/research/ai-agent-cost-and-latency.md` before changing either, and
 * remember that reasoning effort is part of the prompt-cache key. */
export const aiAgentConfig = {
  apiKey: env.COMPLETION_GATEWAY_API_KEY ?? env.OPENROUTER_API_KEY,
  baseUrl: env.COMPLETION_GATEWAY_BASE_URL,
  maxOutputTokens: env.LLM_MAIN_MAX_OUTPUT_TOKENS,
  reasoningEffort: env.LLM_MAIN_REASONING_EFFORT,
} as const;

/** The eval suite runs by hand against one configured Workspace (ADR-0010).
 * The judge is deliberately a different model from the one under test. */
export const evalConfig = {
  judgeModelId: env.EVAL_JUDGE_MODEL ?? env.LLM_MODEL_FAST,
  workspaceId: env.EVAL_WORKSPACE_ID,
} as const;

export const mayarConfig = {
  apiKey: env.MAYAR_API_KEY,
  apiUrl: env.MAYAR_API_URL.replace(/\/$/, ""),
} as const;

export const toolEncryptionConfig = {
  get masterKey() {
    if (!env.TOOL_MASTER_KEY) {
      throw new Error("TOOL_MASTER_KEY is required to encrypt or decrypt Tool secrets.");
    }
    return env.TOOL_MASTER_KEY;
  },
} as const;

export const httpToolConfig = {
  allowLocalHttp: !appConfig.isProduction && env.ALLOW_LOCAL_HTTP_TOOLS,
  maxResultBytes: 64 * 1024,
  timeoutMs: 15_000,
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
  slowRequestMs: env.SLOW_REQUEST_MS,
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
