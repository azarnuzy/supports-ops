import { afterEach, expect, it, vi } from "vitest";
import { encryptToolSecret } from "../tools/secrets";

const key = Buffer.alloc(32, 1).toString("base64");
vi.mock("../../config", () => ({
  evalConfig: { destinationAllowedHosts: [] },
  telemetryConfig: { enabled: false },
  toolEncryptionConfig: { masterKey: key },
}));
vi.mock("../../utils/prisma", () => ({ prisma: {} }));
vi.mock("../eval-destination/outbound", () => ({
  assertSafeDestination: vi.fn(async () => {}),
  UnsafeDestinationError: class extends Error {},
}));

const { langfuseScores, workspaceSink } = await import("./sinks");
const traceId = "a".repeat(32);
const spanId = "b".repeat(16);
const evidence = (traced = true) =>
  JSON.stringify({
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              { attributes: [{ key: "anvia.eval.run.id", value: { stringValue: "run1" } }] },
              {
                ...(traced ? { traceId, spanId } : {}),
                attributes: [
                  { key: "anvia.eval.id", value: { stringValue: "score1" } },
                  { key: "gen_ai.evaluation.name", value: { stringValue: "quality" } },
                  { key: "gen_ai.evaluation.score.value", value: { doubleValue: 0 } },
                  { key: "anvia.eval.outcome", value: { stringValue: "fail" } },
                  { key: "anvia.eval.run.id", value: { stringValue: "run1" } },
                  {
                    key: "gen_ai.evaluation.explanation",
                    value: { stringValue: "Incorrect answer" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
const destination = {
  credentialsEncrypted: encryptToolSecret(
    JSON.stringify({ publicKey: "pk", secretKey: "sk" }),
    key,
  ),
  endpoint: "https://us.cloud.langfuse.com/api/public/otel/v1/traces",
};
afterEach(() => vi.unstubAllGlobals());

it("marks invalid evaluations categorically instead of publishing a zero grade", () => {
  const body = evidence().replace('"stringValue":"fail"', '"stringValue":"invalid"');
  expect(langfuseScores(body)[0]).toMatchObject({ value: "invalid", dataType: "CATEGORICAL" });
});

it("preserves score IDs, zero, comments, metadata and trace links; untraced cases attach to the Run", () => {
  expect(langfuseScores(evidence())).toEqual([
    expect.objectContaining({
      id: "score1",
      name: "quality",
      value: 0,
      dataType: "NUMERIC",
      traceId,
      observationId: spanId,
      comment: "Incorrect answer",
      metadata: expect.objectContaining({ "anvia.eval.outcome": "fail" }),
    }),
  ]);
  expect(langfuseScores(evidence(false))[0]).toMatchObject({ sessionId: "eval-run-run1" });
  expect(langfuseScores(evidence(false))[0]).not.toHaveProperty("traceId");
});

it("routes Langfuse scores to the public API and retains their IDs on replay", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", request);
  const sink = workspaceSink({ ...destination, backend: "LANGFUSE" });
  await sink.send("logs", evidence());
  await sink.send("logs", evidence());
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "https://us.cloud.langfuse.com/api/public/scores",
    "https://us.cloud.langfuse.com/api/public/scores",
  ]);
  expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string).id).toBe("score1");
  expect(JSON.parse(request.mock.calls[1]?.[1]?.body as string).id).toBe("score1");
  expect(request.mock.calls[0]?.[1]).toMatchObject({ method: "POST", redirect: "manual" });
  expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
    `Basic ${Buffer.from("pk:sk").toString("base64")}`,
  );
  await sink.send("traces", '{"resourceSpans":[]}');
  expect(request.mock.calls[2]?.[0]).toBe(destination.endpoint);
});

it("keeps Lens on OTLP logs and propagates score failures for delivery retry", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", request);
  await workspaceSink({ ...destination, backend: "LENS" }).send("logs", evidence());
  expect(request.mock.calls[0]?.[0]).toBe("https://us.cloud.langfuse.com/api/public/otel/v1/logs");
  expect(request.mock.calls[0]?.[1]?.body).toBe(evidence());
  request.mockResolvedValueOnce(new Response("", { status: 503 }));
  await expect(
    workspaceSink({ ...destination, backend: "LANGFUSE" }).send("logs", evidence()),
  ).rejects.toThrow("503");
});
