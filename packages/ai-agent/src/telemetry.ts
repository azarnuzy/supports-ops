import { Agent, type CompletionModel } from "@anvia/core";
import type { AgentObserver } from "@anvia/core/observability";
import { createOtelObserver } from "@anvia/otel";
import type { z } from "zod";
import type { AgentTools } from "./tools";

/**
 * Agent telemetry wiring (ADR-0010). The observer emits agent, generation, and
 * tool spans through the host process's OpenTelemetry SDK — the pipeline
 * `@repo/logger`'s `startTelemetry` configures — and never starts an SDK of
 * its own; without one, spans are no-ops.
 *
 * Capture defaults to `safe`: prompt and response bodies are dropped, so
 * Internal-Only material that reached a prompt never leaves the process in raw
 * form. `TELEMETRY_CAPTURE_MODE=full` exports those bodies instead, which is
 * what makes a local trace show what the AI Agent was actually asked and what
 * it answered. Never set it where the telemetry backend is shared or remote.
 */
export const captureMode = process.env.TELEMETRY_CAPTURE_MODE === "full" ? "full" : "safe";

let observer: AgentObserver | undefined;

/** Spread into `new Agent({...})` to export an agent's runs as spans. The
 * Session and Customer Identity group every run in the telemetry backend
 * without exporting the Customer's email address or phone number. */
export function agentObservability(sessionId?: string, userId?: string) {
  observer ??= createOtelObserver({ captureMode });
  return {
    observability: { observers: { otel: observer }, primaryTrace: "otel" },
    ...(sessionId ? { trace: { sessionId, userId } } : {}),
  } as const;
}

/** Constructs every Anvia `Agent` used by this package, wiring {@link agentObservability} in. */
export function createAgent<Output>(options: {
  id: string;
  instructions: string;
  model: CompletionModel;
  outputSchema: z.ZodType<Output>;
  tools?: AgentTools;
  maxTurns?: number;
  sessionId?: string;
  userId?: string;
}): Agent<Output> {
  return new Agent({
    ...agentObservability(options.sessionId, options.userId),
    id: options.id,
    instructions: options.instructions,
    maxTurns: options.maxTurns,
    model: options.model,
    outputSchema: options.outputSchema,
    tools: options.tools,
  });
}
