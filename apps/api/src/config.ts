import type { TelemetryConfig, TelemetryExporter } from "@repo/logger/telemetry";
import { z } from "zod";

export type RuntimeEnv = "development" | "test" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

const defaultClientOrigins = "http://localhost:3000,http://localhost:4000";
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:15432/monorepo_template?schema=public";
const defaultBetterAuthUrl = "http://localhost:8000";
const defaultBetterAuthSecret = "dev-change-me";
const productionSecretMinimumLength = 32;

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
    CLIENT_ORIGINS: z.string().trim().min(1).default(defaultClientOrigins),
    DATABASE_URL: z.string().trim().min(1).default(defaultDatabaseUrl),
    ENABLE_TELEMETRY: booleanSchema.default(false),
    LOG_LEVEL: logLevelSchema,
    TELEMETRY_API_KEY: optionalStringSchema,
    TELEMETRY_API_KEY_HEADER: z.string().trim().min(1).default("authorization"),
    TELEMETRY_EXPORTER: telemetryExporterSchema,
    TELEMETRY_EXPORTER_OTLP_ENDPOINT: optionalStringSchema,
    TELEMETRY_SERVICE_NAMESPACE: optionalStringSchema,
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
