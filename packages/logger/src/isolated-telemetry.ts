import type { Context, Tracer } from "@opentelemetry/api";
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
import { nameModelTurn } from "./telemetry";

class ModelTurnSpanProcessor extends BatchSpanProcessor {
  override onStart(span: Span, parentContext: Context) {
    nameModelTurn(span);
    super.onStart(span, parentContext);
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
  const resource = resourceFromAttributes({ "service.name": options.serviceName });

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

  return {
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
    tracer: tracerProvider.getTracer("@anvia/otel") as Tracer,
  };
}
