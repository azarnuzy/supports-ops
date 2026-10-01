import {
  context,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Tracer,
} from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonLogsSerializer, JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordExporter,
  type ReadableLogRecord,
} from "@opentelemetry/sdk-logs";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorage } from "node:async_hooks";
import { addLangfuseIoAttributes, nameModelTurn } from "./telemetry";

const caseAttributes = new AsyncLocalStorage<Attributes>();

/** Preserve evaluation content while removing credential fields, including JSON Tool payloads. */
export function redactEvalPayload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.stringify(redactEvalPayload(JSON.parse(value)));
    } catch {
      return value.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [redacted]");
    }
  }
  if (Array.isArray(value)) return value.map(redactEvalPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      /^(authorization|cookie|set-cookie|password|passwordHash|api[-_]?key|secret[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret)$/i.test(key)
        ? "[redacted]"
        : redactEvalPayload(entry),
    ]));
  }
  return value;
}

class ModelTurnSpanProcessor extends BatchSpanProcessor {
  override onStart(span: Span, parentContext: Context) {
    span.setAttributes(caseAttributes.getStore() ?? {});
    nameModelTurn(span);
    super.onStart(span, parentContext);
  }

  override onEnd(span: ReadableSpan) {
    addLangfuseIoAttributes(span);
    const attributes = span.attributes as Record<string, unknown>;
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === "string") attributes[key] = redactEvalPayload(value);
    }
    if (span.status.message) span.status.message = String(redactEvalPayload(span.status.message));
    for (const event of span.events) {
      for (const [key, value] of Object.entries(event.attributes ?? {})) {
        if (typeof value === "string") event.attributes![key] = String(redactEvalPayload(value));
      }
    }
    const model = attributes["anvia.generation.model_id"];
    if (
      typeof model === "string" && model &&
      typeof attributes["anvia.generation.turn"] === "number"
    ) {
      attributes["langfuse.observation.model.name"] = model;
      attributes["langfuse.observation.type"] = "generation";
    }
    for (const direction of ["input", "output"] as const) {
      const tokens = attributes[`anvia.usage.${direction}_tokens`];
      if (typeof tokens === "number") attributes[`gen_ai.usage.${direction}_tokens`] = tokens;
    }
    const session = attributes["anvia.trace.session_id"];
    if (typeof session === "string") attributes["langfuse.session.id"] = session;
    const user = attributes["anvia.trace.user_id"];
    if (typeof user === "string") attributes["langfuse.user.id"] = user;
    super.onEnd(span);
  }
}

export type TelemetrySignal = "logs" | "traces";

/** One place evidence is sent. `send` gets a complete OTLP/JSON request body and throws when the
 * destination did not accept it. */
export type TelemetrySink = {
  name: string;
  send(signal: TelemetrySignal, body: string): Promise<void>;
};

export type TelemetryExportFailure = {
  body: string;
  error: string;
  signal: TelemetrySignal;
  sink: string;
};

/**
 * A tracer and logger that belong to one invocation (an Eval Run), with their own providers that
 * are never registered globally. Whatever is recorded through them goes to the given sinks and
 * nowhere else, so routing a Run's evidence to a Workspace's destination cannot change where
 * other work in the process reports (ADR-0010's global provider stays untouched).
 *
 * A request a sink rejects is handed to `onFailure` as a ready-to-replay OTLP body rather than
 * dropped, so delivery can be retried later without re-running anything.
 */
export function createIsolatedTelemetry(options: {
  onFailure(failure: TelemetryExportFailure): Promise<void> | void;
  serviceName: string;
  sinks: readonly TelemetrySink[];
}) {
  const resource = resourceFromAttributes({
    "service.name": options.serviceName,
    "langfuse.environment": "evaluation",
  });

  const deliver = async (
    sink: TelemetrySink,
    signal: TelemetrySignal,
    body: string,
  ): Promise<ExportResult> => {
    try {
      await sink.send(signal, body);
      return { code: ExportResultCode.SUCCESS };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await options.onFailure({ body, error: message.slice(0, 500), signal, sink: sink.name });
      return { code: ExportResultCode.FAILED };
    }
  };
  const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: options.sinks.map(
      (sink) =>
        new ModelTurnSpanProcessor({
          export: (spans: ReadableSpan[], done: (result: ExportResult) => void) => {
            deliver(sink, "traces", decode(JsonTraceSerializer.serializeRequest(spans))).then(done);
          },
          shutdown: async () => {},
        } satisfies SpanExporter),
    ),
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: options.sinks.map(
      (sink) =>
        new BatchLogRecordProcessor({
          exporter: {
            export: (records: ReadableLogRecord[], done: (result: ExportResult) => void) => {
              deliver(sink, "logs", decode(JsonLogsSerializer.serializeRequest(records))).then(
                done,
              );
            },
            forceFlush: async () => {},
            shutdown: async () => {},
          } satisfies LogRecordExporter,
        }),
    ),
  });

  const tracer = tracerProvider.getTracer("@anvia/otel") as Tracer;
  return {
    /** One local-data experiment item, including cases without an Agent model call. */
    async runCase<T>(attributes: Attributes, input: unknown, expected: unknown, fn: (root: {
      traceId: string;
      observationId: string;
      setOutput(output: unknown): void;
      setError(error: unknown): void;
      setAttributes(attributes: Attributes): void;
    }) => Promise<T>): Promise<T> {
      return caseAttributes.run(attributes, async () => {
        const span = tracer.startSpan("eval.case", {}, ROOT_CONTEXT);
        const { traceId, spanId } = span.spanContext();
        const itemAttributes = { ...attributes, "langfuse.experiment.item.root_observation_id": spanId };
        span.setAttributes({
          ...itemAttributes,
          "langfuse.observation.input": JSON.stringify(redactEvalPayload(input)),
          "langfuse.experiment.item.expected_output": JSON.stringify(redactEvalPayload(expected)),
        });
        try {
          return await caseAttributes.run(itemAttributes, () =>
            context.with(trace.setSpan(ROOT_CONTEXT, span), () => fn({
              traceId,
              observationId: spanId,
              setOutput: (output) => span.setAttribute("langfuse.observation.output", JSON.stringify(redactEvalPayload(output))),
              setAttributes: (values) => span.setAttributes(values),
              setError: (error) => span.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(redactEvalPayload(String(error))),
              }),
            })),
          );
        } catch (error) {
          const message = String(redactEvalPayload(String(error)));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          span.setAttribute("langfuse.observation.output", JSON.stringify({ error: message }));
          throw error;
        } finally {
          span.end();
        }
      });
    },
    /** Sends everything recorded so far, so every failed request is reported before this returns.
     * A refused export makes the SDK's flush reject; that is already reported through `onFailure`,
     * so it is settled here rather than allowed to cut the other provider's flush short. */
    async flush() {
      await Promise.allSettled([tracerProvider.forceFlush(), loggerProvider.forceFlush()]);
    },
    logger: loggerProvider.getLogger("@repo/logger/eval") as Logger,
    async shutdown() {
      await Promise.allSettled([tracerProvider.shutdown(), loggerProvider.shutdown()]);
    },
    tracer,
  };
}
