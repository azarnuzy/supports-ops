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
      const request = destination.sent.find((request) => request.signal === "traces");
      if (!request) throw new Error("No traces exported");
      const body = JSON.parse(request.body);
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

it("exports full evaluation items and maps child payloads, tokens and secrets for Langfuse", async () => {
  const destination = sink("workspace");
  const telemetry = createIsolatedTelemetry({
    onFailure: () => {},
    serviceName: "supportops-evals",
    sinks: [destination.value],
  });
  try {
    await telemetry.runCase(
      {
        "langfuse.experiment.id": "run1",
        "langfuse.experiment.item.id": "case1",
      },
      { message: "question" },
      "expected",
      async (root) => {
        const child = telemetry.tracer.startSpan("model.turn.1", {
          attributes: {
            "anvia.generation.turn": 1,
            "anvia.generation.model_id": "openai/test",
            "anvia.generation.input": JSON.stringify({
              message: "question",
              apiKey: "private-key",
            }),
            "anvia.generation.output_text": "answer",
            "anvia.usage.input_tokens": 12,
            "anvia.usage.output_tokens": 3,
          },
        });
        child.end();
        root.setOutput({ reply: "answer", authorization: "Bearer private-token" });
      },
    );
    await telemetry.flush();
    const request = destination.sent.find((request) => request.signal === "traces");
    if (!request) throw new Error("No traces exported");
    const body = request.body;
    const spans = JSON.parse(body).resourceSpans.flatMap(
      (resource: {
        scopeSpans: Array<{
          spans: Array<{
            name: string;
            spanId: string;
            attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>;
          }>;
        }>;
      }) => resource.scopeSpans.flatMap((scope) => scope.spans),
    );
    const attributes = (name: string) => {
      const span = spans.find((span: { name: string }) => span.name === name);
      if (!span) throw new Error(`Missing span: ${name}`);
      return Object.fromEntries(
        span.attributes.map(
          ({ key, value }: { key: string; value: { stringValue?: string; intValue?: string } }) => [
            key,
            value.stringValue ?? value.intValue,
          ],
        ),
      );
    };
    expect(attributes("eval.case")).toMatchObject({
      "langfuse.experiment.item.expected_output": '"expected"',
      "langfuse.observation.input": '{"message":"question"}',
    });
    expect(attributes("openai/test.turn.1")).toMatchObject({
      "langfuse.experiment.id": "run1",
      "langfuse.experiment.item.id": "case1",
      "langfuse.observation.output": "answer",
      "langfuse.observation.model.name": "openai/test",
    });
    expect(String(attributes("openai/test.turn.1")["gen_ai.usage.input_tokens"])).toBe("12");
    expect(body).not.toContain("private-key");
    expect(body).not.toContain("private-token");
    expect(body).toContain("[redacted]");
  } finally {
    await telemetry.shutdown();
  }
});
