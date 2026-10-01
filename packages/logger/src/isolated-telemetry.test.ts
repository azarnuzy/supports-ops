import { trace } from "@opentelemetry/api";
import { expect, it } from "vitest";
import { createIsolatedTelemetry, type TelemetrySink } from "./isolated-telemetry";

const sink = (name: string, fail = false) => {
  const sent: Array<{ body: string; signal: string }> = [];
  const value: TelemetrySink = {
    name,
    async send(signal, body) {
      if (fail) throw new Error("refused");
      sent.push({ body, signal });
    },
  };
  return { sent, value };
};

it("exports actual model names and turn numbers to every eval destination", async () => {
  const central = sink("central");
  const workspace = sink("workspace");
  const telemetry = createIsolatedTelemetry({
    onFailure: () => {},
    serviceName: "supportops-evals",
    sinks: [central.value, workspace.value],
  });
  try {
    for (const [name, modelId] of [
      ["model.turn.1", "openai/gpt-5.6-luna"],
      ["model.turn.2", "anthropic/claude-sonnet-4"],
      ["model.turn.3", ""],
      ["tool.searchKnowledge", "openai/gpt-5.6-luna"],
    ] as const) {
      telemetry.tracer
        .startSpan(name, {
          attributes: { "anvia.generation.model_id": modelId },
        })
        .end();
    }
    await telemetry.flush();
    for (const destination of [central, workspace]) {
      const body = JSON.parse(
        destination.sent.find((request) => request.signal === "traces")!.body,
      );
      const names = body.resourceSpans.flatMap(
        (resource: { scopeSpans: Array<{ spans: Array<{ name: string }> }> }) =>
          resource.scopeSpans.flatMap((scope) => scope.spans.map((span) => span.name)),
      );
      expect(names).toEqual([
        "openai/gpt-5.6-luna.turn.1",
        "anthropic/claude-sonnet-4.turn.2",
        "model.turn.3",
        "tool.searchKnowledge",
      ]);
    }
  } finally {
    await telemetry.shutdown();
  }
});

it("sends a span and a log to every sink, keeps refused requests, and leaves the global provider alone", async () => {
  const good = sink("central");
  const bad = sink("workspace", true);
  const failures: Array<{ sink: string; signal: string; body: string }> = [];
  const telemetry = createIsolatedTelemetry({
    onFailure: (failure) => void failures.push(failure),
    serviceName: "test",
    sinks: [good.value, bad.value],
  });

  const globalTracer = trace.getTracer("global");
  telemetry.tracer.startSpan("case.span").end();
  telemetry.logger.emit({ body: "score" });
  await telemetry.flush();
  await telemetry.shutdown();

  expect(good.sent.map((request) => request.signal).sort()).toEqual(["logs", "traces"]);
  expect(good.sent.find((request) => request.signal === "traces")?.body).toContain("case.span");
  // The refused requests are handed back whole, ready to replay.
  expect(failures.map((failure) => `${failure.sink}:${failure.signal}`).sort()).toEqual([
    "workspace:logs",
    "workspace:traces",
  ]);
  expect(JSON.parse(failures[0]?.body ?? "{}")).toBeTypeOf("object");
  // A span from the ordinary global tracer went nowhere near either sink.
  globalTracer.startSpan("production.span").end();
  expect(JSON.stringify(good.sent)).not.toContain("production.span");
});
