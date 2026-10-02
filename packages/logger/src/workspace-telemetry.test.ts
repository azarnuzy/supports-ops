import { ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { expect, test } from "vitest";
import { WorkspaceTelemetrySpanProcessor, workspaceTelemetrySuppressed } from "./telemetry";
import type { TelemetrySink } from "./isolated-telemetry";

test("workspace routing isolates concurrent operations, freezes settings and tolerates failure", async () => {
  const sent: Record<"first" | "second" | "replacement", string[]> = {
    first: [],
    second: [],
    replacement: [],
  };
  const sink = (name: keyof typeof sent): TelemetrySink => ({
    name,
    async send(signal, body) {
      expect(signal).toBe("traces");
      sent[name].push(body);
    },
  });
  const destinations = new Map<string, TelemetrySink | null>([
    ["w1", sink("first")],
    ["w2", sink("second")],
    ["disabled", null],
    [
      "broken",
      {
        name: "broken",
        async send() {
          throw new Error("unreachable");
        },
      },
    ],
  ]);
  const lookups: string[] = [];
  const processor = new WorkspaceTelemetrySpanProcessor(() => ({
    workspaceId: () => undefined,
    async resolveSink(workspaceId) {
      lookups.push(workspaceId);
      return destinations.get(workspaceId) ?? null;
    },
  }));
  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
  const tracer = provider.getTracer("@repo/logger");
  const agentTracer = provider.getTracer("@anvia/otel");
  const root = (workspaceId: string) =>
    tracer.startSpan(
      "customer.turn",
      {
        attributes: { "supportops.workspace_id": workspaceId },
      },
      ROOT_CONTEXT,
    );
  const first = root("w1");
  const second = root("w2");
  const disabled = root("disabled");
  destinations.set("w1", sink("replacement"));
  destinations.set("disabled", sink("replacement"));
  const child = agentTracer.startSpan(
    "model.turn.1",
    {
      attributes: { "anvia.generation.output_text": "same capture as central" },
    },
    trace.setSpan(ROOT_CONTEXT, first),
  );
  child.end();
  const unrelated = provider.getTracer("third-party").startSpan("infrastructure", {
    attributes: { "supportops.workspace_id": "w2" },
  });
  unrelated.end();
  tracer
    .startSpan(
      "evaluation",
      {
        attributes: { "supportops.workspace_id": "w1" },
      },
      ROOT_CONTEXT.setValue(workspaceTelemetrySuppressed, true),
    )
    .end();
  first.end();
  second.end();
  disabled.end();
  root("broken").end();
  await processor.forceFlush();
  expect(lookups).toEqual(["w1", "w2", "disabled", "broken"]);
  expect(sent.first.length).toBeGreaterThan(0);
  expect(sent.second.length).toBeGreaterThan(0);
  expect(sent.first.join()).toContain("model.turn.1");
  expect(sent.first.join()).toContain("same capture as central");
  expect(sent.first.join()).not.toContain('"stringValue":"w2"');
  expect(sent.second.join()).not.toContain('"stringValue":"w1"');
  expect(sent.second.join()).not.toContain("infrastructure");
  expect(sent.replacement).toEqual([]);
  root("w1").end();
  await processor.forceFlush();
  expect(sent.replacement.join()).toContain('"stringValue":"w1"');
  await provider.shutdown();
});
