import { context, trace } from "@opentelemetry/api";
import pino, { type Bindings, type Logger, type LoggerOptions } from "pino";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export type LoggerConfig = {
  environment: string;
  level: LogLevel;
  service: string;
};

export type TraceContext = {
  spanId?: string;
  traceFlags?: string;
  traceId?: string;
};

export type CreateLoggerOptions = LoggerConfig & {
  bindings?: Bindings;
  options?: LoggerOptions;
  traceContext?: TraceContext;
};

export const redactedLogPaths = [
  "authorization",
  "cookie",
  "password",
  "passwordHash",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.passwordHash",
];

export function createLogger({
  bindings,
  environment,
  level,
  options,
  service,
  traceContext,
}: CreateLoggerOptions): Logger {
  const { mixin, ...loggerOptions } = options ?? {};

  return pino({
    base: {
      environment,
      service,
      ...getTraceLogBindings(traceContext),
      ...bindings,
    },
    level,
    redact: {
      censor: "[redacted]",
      paths: redactedLogPaths,
    },
    mixin: (mergeObject, level, logger) => ({
      ...getActiveTraceLogBindings(),
      ...(mixin ? mixin(mergeObject, level, logger) : {}),
    }),
    timestamp: pino.stdTimeFunctions.isoTime,
    ...loggerOptions,
  });
}

export function createChildLogger(logger: Logger, bindings: Bindings) {
  return logger.child(bindings);
}

export function createTraceLogger(logger: Logger, traceContext: TraceContext) {
  return logger.child(getTraceLogBindings(traceContext));
}

export function getTraceLogBindings(traceContext: TraceContext | undefined): Bindings {
  return {
    ...(traceContext?.traceId ? { trace_id: traceContext.traceId } : {}),
    ...(traceContext?.spanId ? { span_id: traceContext.spanId } : {}),
    ...(traceContext?.traceFlags ? { trace_flags: traceContext.traceFlags } : {}),
  };
}

export function getActiveTraceLogBindings(): Bindings {
  const spanContext = trace.getSpanContext(context.active());

  if (!spanContext) {
    return {};
  }

  return getTraceLogBindings({
    spanId: spanContext.spanId,
    traceFlags: `0${spanContext.traceFlags.toString(16)}`.slice(-2),
    traceId: spanContext.traceId,
  });
}

export type { Logger };
