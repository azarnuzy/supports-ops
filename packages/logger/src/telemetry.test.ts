import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import { expect, test } from "vitest";
import {
  addLangfuseIoAttributes,
  injectTraceContext,
  shutdownTelemetry,
  startTelemetry,
  withSpan,
  withTraceContext,
} from "./telemetry";

test("telemetry names model turns and continues queued traces after the producer span ends", async () => {
  startTelemetry({
    config: {
      apiKeyHeader: "authorization",
      enabled: true,
      environment: "test",
      exporter: "console",
    },
    serviceName: "telemetry-test",
  });
  try {
    for (const [name, modelId, expectedName] of [
      ["model.turn.1", "openai/gpt-4.1", "openai/gpt-4.1.turn.1"],
      ["model.turn.2", "anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4.turn.2"],
      ["model.turn.3", "", "model.turn.3"],
      ["tool.lookup", "openai/gpt-4.1", "tool.lookup"],
    ] as const) {
      const span = trace.getTracer("@anvia/otel").startSpan(name, {
        attributes: { "anvia.generation.model_id": modelId },
      });
      expect(span).toHaveProperty("name", expectedName);
      span.end();
    }
    const queued = await withSpan(
      "enqueue",
      { "langfuse.observation.input": "private text" },
      async () => ({
        carrier: injectTraceContext(),
        childInput: await withSpan(
          "child",
          {},
          async () =>
            propagation.getBaggage(context.active())?.getEntry("langfuse.observation.input")?.value,
        ),
        traceId: trace.getSpan(context.active())?.spanContext().traceId,
      }),
    );
    expect(queued.carrier).not.toHaveProperty("baggage");
    expect(queued.childInput).toBeUndefined();
    const workerTraceId = await withTraceContext(queued.carrier, () =>
      withSpan("worker", {}, async () => trace.getSpan(context.active())?.spanContext().traceId),
    );
    expect(workerTraceId).toBe(queued.traceId);
    expect(workerTraceId).toMatch(/^[0-9a-f]{32}$/);
  } finally {
    await shutdownTelemetry();
  }
});

test("safe spans get useful per-span summaries without exporting content", () => {
  const span = {
    name: "external.mistral.ocr",
    status: { code: SpanStatusCode.ERROR },
    attributes: {
      "external.provider": "MISTRAL",
      "external.operation": "OCR",
      "external.model_id": "mistral-ocr-latest",
      "http.response.status_code": 429,
      "error.type": "rate_limit_exceeded",
      "anvia.run.error": "secret provider response",
      "anvia.run.prompt": undefined,
    } as Record<string, unknown>,
  };
  addLangfuseIoAttributes(span);
  expect(JSON.parse(span.attributes["langfuse.observation.input"] as string)).toEqual({
    operation: "external.mistral.ocr",
    provider: "MISTRAL",
    action: "OCR",
    externalModel: "mistral-ocr-latest",
  });
  expect(JSON.parse(span.attributes["langfuse.observation.output"] as string)).toEqual({
    status: "error",
    httpStatus: 429,
    errorCode: "rate_limit_exceeded",
  });
  expect(span.attributes["supportops.span.input_summary"]).toBe(
    span.attributes["langfuse.observation.input"],
  );
  expect(JSON.stringify(span.attributes["langfuse.observation.output"])).not.toContain(
    "secret provider response",
  );
});

test("full capture stays on the individual span", () => {
  const span = {
    name: "model.turn.1",
    status: { code: SpanStatusCode.OK },
    attributes: {
      "anvia.generation.input": '{"messages":["hello"]}',
      "anvia.generation.output_text": "answer",
    } as Record<string, unknown>,
  };
  addLangfuseIoAttributes(span);
  expect(span.attributes["langfuse.observation.input"]).toBe('{"messages":["hello"]}');
  expect(span.attributes["langfuse.observation.output"]).toBe("answer");
  expect(span.attributes["supportops.span.input_summary"]).toBeUndefined();
});
