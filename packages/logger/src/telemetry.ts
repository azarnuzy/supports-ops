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

/** `@anvia/otel` names its input/output attributes per span kind (e.g.
 * `anvia.generation.input`, `anvia.run.output`), which Anvia Lens reads
 * natively — but Langfuse's OTLP ingestion only populates an observation's
 * Input/Output from a fixed set of attribute names. Highest-priority match
 * per direction wins. */
const LANGFUSE_INPUT_SOURCES = [
  "anvia.generation.input",
  "anvia.run.prompt",
  "anvia.pipeline.input",
  "anvia.pipeline.stage.input",
  "anvia.tool.args",
  "anvia.tool.call",
];
const LANGFUSE_OUTPUT_SOURCES = [
  "anvia.generation.output",
  "anvia.generation.output_text",
  "anvia.run.output",
  "anvia.run.text",
  "anvia.pipeline.output",
  "anvia.pipeline.stage.output",
  "anvia.tool.result",
  "anvia.child_agent.output",
  "anvia.child_agent.text",
];

function carriesTraceIdentity(key: string) {
  return (
    key.startsWith("anvia.trace.") ||
    key === "langfuse.session.id" ||
    key === "langfuse.user.id" ||
    key.startsWith("langfuse.trace.")
  );
}

function present(value: unknown) {
  return value !== undefined && value !== "" && value !== "undefined";
}

/** Summaries contain only allowlisted operational fields, never message bodies. */
export function addLangfuseIoAttributes(span: {
  name: string;
  status: { code: SpanStatusCode };
  attributes: Record<string, unknown>;
}) {
  const attributes = span.attributes;
  if (!present(attributes["langfuse.observation.input"])) {
    const key = LANGFUSE_INPUT_SOURCES.find((source) => present(attributes[source]));
    if (key) attributes["langfuse.observation.input"] = attributes[key];
  }
  if (!present(attributes["langfuse.observation.output"])) {
    const key = LANGFUSE_OUTPUT_SOURCES.find((source) => present(attributes[source]));
    if (key) attributes["langfuse.observation.output"] = attributes[key];
  }

  const safeFields = (fields: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(fields).flatMap(([label, key]) => {
        const value = attributes[key];
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? [[label, value]]
          : [];
      }),
    );
  if (!present(attributes["langfuse.observation.input"])) {
    const summary = JSON.stringify({
      operation: span.name,
      ...safeFields({
        provider: "external.provider",
        action: "external.operation",
        model: "anvia.generation.model_id",
        externalModel: "external.model_id",
        agent: "anvia.agent.name",
        tool: "anvia.tool.name",
        ticketId: "supportops.ticket_id",
        messageId: "supportops.message_id",
        providerMessageId: "supportops.provider_message_id",
        attachmentId: "supportops.attachment_id",
        mediaId: "supportops.media_id",
        attempt: "supportops.attempt",
        toolCount: "anvia.generation.tool_count",
      }),
    });
    attributes["langfuse.observation.input"] = summary;
    attributes["supportops.span.input_summary"] = summary;
  }
  if (!present(attributes["langfuse.observation.output"])) {
    const summary = JSON.stringify({
      status:
        span.status.code === SpanStatusCode.ERROR
          ? "error"
          : span.status.code === SpanStatusCode.OK
            ? "ok"
            : "unset",
      ...safeFields({
        outcome: "supportops.outcome",
        decision: "ai_agent.decision",
        escalationReason: "ai_agent.escalation_reason",
        category: "ai_agent.category",
        priority: "ai_agent.priority",
        qualifies: "ai_agent.qualifies",
        deliveryStatus: "supportops.delivery_status",
        readReceiptSent: "supportops.read_receipt_sent",
        processingStatus: "supportops.processing_status",
        runStatus: "anvia.run.status",
        toolSkipped: "anvia.tool.skipped",
        attachments: "ai_agent.attachments",
        httpStatus: "http.response.status_code",
        errorCode: "error.type",
        inputTokens: "anvia.usage.input_tokens",
        outputTokens: "anvia.usage.output_tokens",
      }),
    });
    attributes["langfuse.observation.output"] = summary;
    attributes["supportops.span.output_summary"] = summary;
  }
}

/** Passes a span to `inner` only when an allowed tracer created it. */
class AgentScopeSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: SdkSpan, parentContext: Context) {
    const modelId = span.attributes["anvia.generation.model_id"];
    if (/^model\.turn\.\d+$/.test(span.name) && typeof modelId === "string" && modelId) {
      span.updateName(`${modelId}${span.name.slice("model".length)}`);
    }
    for (const [key, entry] of propagation.getBaggage(parentContext)?.getAllEntries() ?? []) {
      if (carriesTraceIdentity(key)) {
        span.setAttribute(key, entry.value);
      }
    }
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan) {
    if (exportedTracerScopes.has(span.instrumentationScope.name)) {
      addLangfuseIoAttributes(span);
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

/** Carry the current trace through a queue without copying prompts or customer data. */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  delete carrier.baggage;
  return carrier;
}

export function withTraceContext<T>(carrier: Record<string, string> | undefined, fn: () => T): T {
  return context.with(
    carrier ? propagation.extract(context.active(), carrier) : context.active(),
    fn,
  );
}

export function recordExternalFailure(attributes: Attributes) {
  trace.getSpan(context.active())?.addEvent("external.service.error", attributes);
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
 * wrapper that simply runs `fn`. Ends with an error status when `fn` throws;
 * sensitive provider exceptions may omit their raw details. */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
  recordException = true,
  isFailure?: (result: T) => boolean,
): Promise<T> {
  const baggageEntries = Object.fromEntries(
    propagation.getBaggage(context.active())?.getAllEntries() ?? [],
  );
  for (const [key, value] of Object.entries(attributes)) {
    if (carriesTraceIdentity(key) && typeof value === "string") {
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
      span.setStatus({ code: isFailure?.(result) ? SpanStatusCode.ERROR : SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (recordException) span.recordException(error as Exception);
      if (error && typeof error === "object") {
        if (
          "status" in error &&
          typeof error.status === "number" &&
          error.status >= 100 &&
          error.status <= 599
        )
          span.setAttribute("http.response.status_code", error.status);
        if (
          "code" in error &&
          (typeof error.code === "string" || typeof error.code === "number") &&
          /^[A-Za-z0-9_:-]{1,64}$/.test(String(error.code))
        )
          span.setAttribute("error.type", String(error.code));
      }
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
export type { Span };

export function getTelemetryHeaders(config: TelemetryConfig) {
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
  // Without this, Langfuse routes OTLP data through its legacy delayed
  // ingestion path instead of real-time.
  return { [config.apiKeyHeader]: credential, "x-langfuse-ingestion-version": "4" };
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
