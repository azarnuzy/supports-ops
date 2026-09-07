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
  ENABLE_TELEMETRY: booleanSchema.default(false),
  LOG_LEVEL: logLevelSchema,
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:16379"),
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
