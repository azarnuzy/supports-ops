import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";

export type TelemetryExporter = "console" | "otlp";

export type TelemetryConfig = {
  apiKey?: string;
  apiKeyHeader: string;
  enabled: boolean;
  environment: string;
  exporter: TelemetryExporter;
  otlpEndpoint?: string;
  serviceNamespace?: string;
};

export type StartTelemetryOptions = {
  config: TelemetryConfig;
  serviceName: string;
};

let sdk: NodeSDK | null = null;

export function startTelemetry({ config, serviceName }: StartTelemetryOptions) {
  if (!config.enabled || sdk) {
    return sdk;
  }

  sdk = new NodeSDK({
    instrumentations: [getNodeAutoInstrumentations()],
    resource: resourceFromAttributes({
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
      [ATTR_SERVICE_NAME]: serviceName,
      ...(config.serviceNamespace ? { [ATTR_SERVICE_NAMESPACE]: config.serviceNamespace } : {}),
    }),
    traceExporter:
      config.exporter === "console"
        ? new ConsoleSpanExporter()
        : new OTLPTraceExporter({
            headers: getTelemetryHeaders(config),
            url: config.otlpEndpoint,
          }),
  });

  sdk.start();
  registerTelemetryShutdown();

  return sdk;
}

export async function shutdownTelemetry() {
  await sdk?.shutdown();
  sdk = null;
}

function getTelemetryHeaders(config: TelemetryConfig) {
  if (!config.apiKey) {
    return undefined;
  }

  return {
    [config.apiKeyHeader]:
      config.apiKeyHeader.toLowerCase() === "authorization"
        ? `Bearer ${config.apiKey}`
        : config.apiKey,
  };
}

function registerTelemetryShutdown() {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdownTelemetry().finally(() => {
        process.kill(process.pid, signal);
      });
    });
  }
}
