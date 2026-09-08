import type { EvalReporter } from "@anvia/core/evals";
import { createOtelEvalReporter } from "@anvia/otel";

/**
 * Results report through the observability reporter (ADR-0010): the same
 * OTel pipeline `agentObservability` exports agent runs through in
 * ../telemetry.ts. Without a started SDK (see `startTelemetry` in
 * `@repo/logger/telemetry`) this is a no-op, same as agent telemetry — the
 * CLI's console output via `printEvalResult` is the suite's day-to-day
 * output either way.
 */
let reporter: EvalReporter | undefined;

export function evalObservabilityReporter(): EvalReporter {
  reporter ??= createOtelEvalReporter({ publishInvalid: true });
  return reporter;
}
