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
