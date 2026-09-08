import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { withSpan } from "@repo/logger/telemetry";
import { agentObservability } from "./telemetry";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
trace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(contextManager);

describe("withSpan", () => {
  beforeEach(() => {
    exporter.reset();
  });

  it("ends the span with the recorded attributes", async () => {
    const result = await withSpan("ai_agent.test", { "ai_agent.kind": "test" }, async (span) => {
      span.setAttribute("inside", 1);
      return "ok";
    });

    expect(result).toBe("ok");
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe("ai_agent.test");
    expect(span.attributes).toMatchObject({ "ai_agent.kind": "test", inside: 1 });
  });

  it("nests inner spans under the outer span's trace", async () => {
    await withSpan("outer", {}, async () => withSpan("inner", {}, async () => null));

    const [inner, outer] = exporter.getFinishedSpans();
    expect(inner.name).toBe("inner");
    expect(outer.name).toBe("outer");
    expect(inner.spanContext().traceId).toBe(outer.spanContext().traceId);
    expect(inner.parentSpanContext?.spanId).toBe(outer.spanContext().spanId);
  });

  it("records the exception and rethrows", async () => {
    await expect(
      withSpan("failing", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.some((event) => event.name === "exception")).toBe(true);
  });
});

describe("agentObservability", () => {
  it("registers one otel observer as the primary trace", () => {
    const first = agentObservability();
    const second = agentObservability();

    expect(first.observability.primaryTrace).toBe("otel");
    expect(second.observability.observers.otel).toBe(first.observability.observers.otel);
  });
});
