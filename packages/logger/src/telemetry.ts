import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Exception,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
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

const tracer = trace.getTracer("@repo/logger");

/** Runs `fn` inside a span of the host process's trace, so nested work and
 * agent observers land under it. Without a started SDK this is a no-op
 * wrapper that simply runs `fn`. Ends with an error status and the recorded
 * exception when `fn` throws. */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error as Exception);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
export type { Span };

function getTelemetryHeaders(config: TelemetryConfig) {
  if (!config.apiKey) {
    return undefined;
  }

  // A bare `authorization` credential gets the conventional `Bearer` prefix; a
  // preformatted value with an explicit scheme — `Basic <base64>`, what
  // Langfuse's OTLP endpoint expects — passes through verbatim.
  const credential =
    config.apiKeyHeader.toLowerCase() === "authorization" && !/\s/.test(config.apiKey)
      ? `Bearer ${config.apiKey}`
      : config.apiKey;
  return { [config.apiKeyHeader]: credential };
}

function registerTelemetryShutdown() {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdownTelemetry().finally(() => {
        process.kill(process.pid, signal);
      });
    });
  }
  // Normal exit (short-lived scripts): flush pending spans before the loop drains.
  process.once("beforeExit", () => {
    void shutdownTelemetry();
  });
}
