import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Exception,
  type Span,
} from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type Span as SdkSpan,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
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

/**
 * The only tracers whose spans leave the process (ADR-0010): `@repo/logger`'s
 * own `withSpan` and the AI Agent observer's `@anvia/otel`. Libraries that
 * instrument themselves against the global tracer share this SDK once it
 * starts — better-auth emits HTTP, handler, and database spans of its own —
 * and that infrastructure noise would consume the telemetry backend's quota
 * for traces nobody reads.
 */
const exportedTracerScopes = new Set(["@anvia/otel", "@repo/logger"]);

/** Passes a span to `inner` only when an allowed tracer created it. */
class AgentScopeSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: SdkSpan, parentContext: Context) {
    for (const [key, entry] of propagation.getBaggage(parentContext)?.getAllEntries() ?? []) {
      if (key.startsWith("anvia.trace.") || key.startsWith("langfuse.")) {
        span.setAttribute(key, entry.value);
      }
    }
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan) {
    if (exportedTracerScopes.has(span.instrumentationScope.name)) {
      this.inner.onEnd(span);
    }
  }

  forceFlush() {
    return this.inner.forceFlush();
  }

  shutdown() {
    return this.inner.shutdown();
  }
}

/**
 * One Session is one Customer conversation, spanning the AI Agent's runs and
 * the Human Agent's replies. Both backends group traces by session but read a
 * different attribute — Lens `anvia.trace.session_id`, Langfuse
 * `langfuse.session.id` — so a trace that should appear in both carries both.
 */
export function sessionAttributes(sessionId: string, userId?: string): Attributes {
  return {
    "anvia.trace.session_id": sessionId,
    "langfuse.session.id": sessionId,
    ...(userId
      ? {
          "anvia.trace.user_id": userId,
          "langfuse.user.id": userId,
        }
      : {}),
  };
}

let sdk: NodeSDK | null = null;

export function startTelemetry({ config, serviceName }: StartTelemetryOptions) {
  if (!config.enabled || sdk) {
    return sdk;
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
      [ATTR_SERVICE_NAME]: serviceName,
      ...(config.serviceNamespace ? { [ATTR_SERVICE_NAMESPACE]: config.serviceNamespace } : {}),
    }),
    spanProcessors: [
      new AgentScopeSpanProcessor(
        config.exporter === "console"
          ? new SimpleSpanProcessor(new ConsoleSpanExporter())
          : new BatchSpanProcessor(
              new OTLPTraceExporter({
                headers: getTelemetryHeaders(config),
                url: config.otlpEndpoint,
              }),
            ),
      ),
    ],
    // Eval results are published as OTel log records, not spans (see
    // `createOtelEvalReporter` in `@anvia/otel`). Without a log pipeline the
    // eval reporter is silently a no-op and nothing reaches the backend's
    // Evaluations view, so the logs exporter is wired here alongside traces.
    logRecordProcessors: [
      config.exporter === "console"
        ? new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })
        : new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              headers: getTelemetryHeaders(config),
              url: otlpLogsEndpoint(config.otlpEndpoint),
            }),
          }),
    ],
  });

  sdk.start();
  registerTelemetryShutdown();

  return sdk;
}

/** The OTLP signals share a base path and differ only in their last segment,
 * so the logs endpoint is derived from the configured traces one rather than
 * asking every environment to set a second, near-identical variable. */
function otlpLogsEndpoint(tracesEndpoint: string | undefined) {
  if (!tracesEndpoint) return undefined;
  return tracesEndpoint.replace(/\/v1\/traces\/?$/, "/v1/logs");
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
  const baggageEntries = Object.fromEntries(
    propagation.getBaggage(context.active())?.getAllEntries() ?? [],
  );
  for (const [key, value] of Object.entries(attributes)) {
    if (
      (key.startsWith("anvia.trace.") || key.startsWith("langfuse.")) &&
      typeof value === "string"
    ) {
      baggageEntries[key] = { value };
    }
  }
  const baggage = propagation.createBaggage(baggageEntries);
  const parentContext = propagation.setBaggage(context.active(), baggage);
  return tracer.startActiveSpan(name, { attributes }, parentContext, async (span) => {
    try {
      const result = await fn(span);
      // OpenTelemetry leaves a span UNSET unless success is stated explicitly,
      // and a trace takes its status from its root span. `ai_agent.turn` is the
      // root of every AI Agent trace, so without this every successful turn
      // reports as "unset" in the telemetry backend and cannot be told apart
      // from one that never finished.
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
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
