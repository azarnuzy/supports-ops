import type { AgentObserver } from "@anvia/core/observability";
import { createOtelObserver } from "@anvia/otel";

/**
 * Agent telemetry wiring (ADR-0010). The observer emits agent, generation, and
 * tool spans through the host process's OpenTelemetry SDK — the pipeline
 * `@repo/logger`'s `startTelemetry` configures — and never starts an SDK of
 * its own; without one, spans are no-ops. Capture is `safe`: prompt and
 * response bodies are dropped, so Internal-Only material that reached a
 * prompt never leaves the process in raw form.
 */
let observer: AgentObserver | undefined;

/** Spread into `new Agent({...})` to export an agent's runs as spans. */
export function agentObservability() {
  observer ??= createOtelObserver({ captureMode: "safe" });
  return {
    observability: { observers: { otel: observer }, primaryTrace: "otel" },
  } as const;
}
