import type { OtelEvalReporterOptions } from "@anvia/otel";
import type { EvalTurnInput, EvalTurnOutput } from "./target";

// `includePayloads` defaults to false, which publishes outcomes with no
// Input/Expected/Output — a run you cannot read without re-running it
// locally. The payload is trimmed on the way out: a turn's raw output
// carries every retrieved chunk and every Tool Result verbatim, which is
// megabytes of noise in a detail pane. What is kept is what a person reads
// when a case fails.
export const evalReporterOptions = {
  captureMaxBytes: 16_000,
  includePayloads: true,
  onMissingTrace: "emit",
  publishInvalid: true,
  // `transformInput` is applied to `expected`, `context`, and
  // `retrievalContext` as well as to the input, so it has to pass anything
  // that is not a turn input straight through — unwrapping blindly turns a
  // case's `expected` string into undefined and Lens shows "No data
  // captured" for it.
  transformInput: (value) => {
    if (typeof value !== "object" || value === null || !("message" in value)) return value;
    const input = value as EvalTurnInput;
    return input.attachments?.length || input.history?.length || input.clarificationCount
      ? input
      : input.message;
  },
  transformOutput: (value) => {
    const output = value as EvalTurnOutput;
    return {
      reply: output.output,
      decision: output.decision,
      ...(output.escalationReason ? { escalationReason: output.escalationReason } : {}),
      durationMs: Math.round(output.durationMs),
      ...(output.ttftMs === undefined ? {} : { ttftMs: Math.round(output.ttftMs) }),
      ...(output.ttfcMs === undefined ? {} : { ttfcMs: Math.round(output.ttfcMs) }),
      usage: output.usage,
      toolCalls: output.toolCalls.map((call) => ({
        durationMs: Math.round(call.durationMs),
        name: call.name,
        status: call.failed ? "failed" : "succeeded",
      })),
      retrievedChunks: output.retrieved.length,
      ...(output.limitations.length ? { limitations: output.limitations } : {}),
    };
  },
} satisfies OtelEvalReporterOptions;
