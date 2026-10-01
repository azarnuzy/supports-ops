import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

/**
 * API-to-worker behaviour for Admin-started Eval Runs. Only the model turn and the outbound OTLP
 * requests are doubled; authorization, selection, snapshots, billing, run transitions and cleanup
 * are real, against a migrated database.
 */
const mocks = vi.hoisted(() => {
  process.env.TOOL_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.ENABLE_TELEMETRY = "true";
  process.env.TELEMETRY_EXPORTER = "otlp";
  process.env.TELEMETRY_EXPORTER_OTLP_ENDPOINT = "https://central.test/v1/traces";
  process.env.TELEMETRY_API_KEY = "central-key";
  process.env.EVAL_DESTINATION_ALLOWED_HOSTS = "lens.test,broken.test";
  return {
    current: { userId: "" },
    deliveries: [] as Array<{
      runId: string;
      target: "CENTRAL" | "WORKSPACE";
      workspaceId: string;
    }>,
    jobs: [] as Array<{ runId: string; workspaceId: string }>,
    judge: { calls: 0, failOn: 0 },
    memories: [] as unknown[],
    retrieverSearches: 0,
    turn: vi.fn(),
  };
});

vi.mock("../auth/instance", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.current.userId
          ? { session: { id: "s" }, user: { id: mocks.current.userId, role: "ADMIN" } }
          : null,
    },
  },
  operatorAuth: { api: { getSession: async () => null } },
}));
vi.mock("./queue", () => ({
  enqueueEvalDelivery: async (job: (typeof mocks.deliveries)[number]) => {
    mocks.deliveries.push(job);
  },
  enqueueEvalRun: async (job: { runId: string; workspaceId: string }) => {
    mocks.jobs.push(job);
  },
}));
vi.mock("../credits/alerts-queue", () => ({
  enqueueCreditAlertEmail: vi.fn(async () => undefined),
}));
vi.mock("@repo/knowledge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/knowledge")>()),
  createOpenAiEmbeddingClient: () => ({ embed: async () => [[0.1]] }),
  searchChunks: async () => {
    mocks.retrieverSearches += 1;
    return [];
  },
}));
// The Judge is a controlled double at the model boundary: Anvia's real metrics run on top of it.
// Its one answer satisfies every Judge schema (steps, statements, verdicts, claims, a score), and
// every completed call reports usage, so the tests count exactly what was called and charged.
vi.mock("@repo/ai-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/ai-agent")>()),
  createReplyModel: () => ({
    capabilities: {
      documentInput: false,
      imageInput: false,
      outputSchema: false,
      reasoning: false,
      streaming: false,
      toolChoice: true,
      tools: true,
    },
    completion: async (request: { tools: Array<{ name: string }> }) => {
      mocks.judge.calls += 1;
      if (mocks.judge.failOn === mocks.judge.calls) throw new Error("judge down");
      return {
        choice: [
          {
            input: {
              claims: ["c"],
              reason: "ok",
              score: 8,
              statements: ["s"],
              steps: ["step"],
              verdicts: [{ reason: "r", supported: true, verdict: "yes" }],
            },
            toolCallId: `call-${mocks.judge.calls}`,
            toolName: request.tools[0]?.name,
            type: "tool-call",
          },
        ],
        finishReason: "tool-calls",
        rawResponse: {},
        usage: {
          cacheCreationInputTokens: 0,
          cachedInputTokens: 2,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      };
    },
    modelId: "judge",
    provider: "fake",
  }),
  runAiAgentTurn: mocks.turn,
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;
let execution: typeof import("./execution");
let secrets: typeof import("../tools/secrets");

const posts: Array<{ authorization: string; signal: string; url: string }> = [];
let failHost = "";

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ app } = await import("../../app"));
  execution = await import("./execution");
  secrets = await import("../tools/secrets");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  Object.assign(mocks.current, { userId: "" });
  mocks.jobs.length = 0;
  mocks.deliveries.length = 0;
  mocks.memories.length = 0;
  mocks.turn.mockReset();
  Object.assign(mocks.judge, { calls: 0, failOn: 0 });
  mocks.retrieverSearches = 0;
  posts.length = 0;
  failHost = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      posts.push({
        authorization: init.headers.authorization ?? "",
        signal: url.endsWith("/v1/logs") ? "logs" : "traces",
        url,
      });
      return new Response("{}", { status: failHost && url.includes(failHost) ? 503 : 200 });
    }),
  );
  await seed();
  // By default the AI Agent replies with the message text reversed into a fixed answer.
  mocks.turn.mockImplementation(async ({ customerMessage, runtime }) => {
    mocks.memories.push(await runtime.loadMemory());
    await runtime.loadTicket();
    if (customerMessage.includes("boom")) throw new Error("provider down");
    await runtime.reply("REPLY", `Refunds take 5 days. (${customerMessage})`, "p");
    await runtime.finish();
  });
});

async function seed() {
  await prisma.organization.createMany({
    data: [
      { id: "org-a", name: "A" },
      { id: "org-b", name: "B" },
    ],
  });
  await prisma.workspace.createMany({
    data: [
      { id: "wa1", organizationId: "org-a", name: "A1", slug: "a1" },
      { id: "wa2", organizationId: "org-a", name: "A2", slug: "a2" },
      { id: "wb", organizationId: "org-b", name: "B", slug: "b" },
    ],
  });
  const user = (id: string, organizationId: string, role: "ADMIN" | "HUMAN_AGENT" = "ADMIN") => ({
    email: `${id}@x.test`,
    id,
    isOrganizationAdmin: false,
    name: id,
    organizationId,
    role,
  });
  await prisma.user.createMany({
    data: [
      user("admin-a1", "org-a"),
      user("agent-a1", "org-a", "HUMAN_AGENT"),
      user("admin-b", "org-b"),
    ],
  });
  await prisma.workspaceMembership.createMany({
    data: [
      { role: "ADMIN", userId: "admin-a1", workspaceId: "wa1" },
      { role: "HUMAN_AGENT", userId: "agent-a1", workspaceId: "wa1" },
      { role: "ADMIN", userId: "admin-b", workspaceId: "wb" },
    ],
  });
  await prisma.creditLedgerEntry.createMany({
    data: [
      {
        credits: 500,
        id: "grant-a",
        organizationId: "org-a",
        type: "TRIAL_GRANT",
        workspaceId: "wa1",
      },
      {
        credits: 500,
        id: "grant-b",
        organizationId: "org-b",
        type: "TRIAL_GRANT",
        workspaceId: "wb",
      },
    ],
  });
  for (const [workspaceId, agentId] of [
    ["wa1", "agent-1"],
    ["wb", "agent-b"],
  ] as const) {
    await prisma.aiAgent.create({
      data: { id: agentId, instructions: "Be brief.", name: "Agent", workspaceId },
    });
    await prisma.channel.create({
      data: { aiAgentId: agentId, id: `web-${workspaceId}`, name: "Web", type: "WEB", workspaceId },
    });
  }
  // A mutating Tool assigned to wa1's AI Agent: an evaluation must never be able to run it.
  await prisma.tool.create({
    data: {
      description: "Cancels an order",
      id: "tool-cancel",
      inputSchema: { type: "object" },
      name: "cancel_order",
      origin: "HTTP",
      risk: "MUTATING",
      workspaceId: "wa1",
    },
  });
  await prisma.httpToolConfig.create({
    data: {
      method: "POST",
      toolId: "tool-cancel",
      url: "https://shop.test/cancel",
      workspaceId: "wa1",
    },
  });
  await prisma.toolAssignment.create({
    data: { aiAgentId: "agent-1", id: "assign-1", toolId: "tool-cancel", workspaceId: "wa1" },
  });
}

async function destination(workspaceId: string, host = "lens.test") {
  await prisma.evalDestination.create({
    data: {
      backend: "LENS",
      credentialsEncrypted: secrets.encryptToolSecret(
        JSON.stringify({ publicKey: `pk-${workspaceId}`, secretKey: `sk-${workspaceId}` }),
        process.env.TOOL_MASTER_KEY as string,
      ),
      dashboardUrl: `https://${host}/dash`,
      endpoint: `https://${host}/api/v1/traces`,
      id: `dest-${workspaceId}`,
      publicKeyLastFour: "0000",
      secretKeyLastFour: "0000",
      workspaceId,
    },
  });
}

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Reply = { json(): Promise<any> } & Response;
const call = (path: string, method = "GET", body?: unknown, workspace = "wa1") =>
  app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-workspace-id": workspace },
    method,
  }) as Promise<Reply>;

async function dataset(workspaceId = "wa1") {
  const created = await prisma.evalDataset.create({
    data: { criteria: "Be kind.", id: `ds-${workspaceId}`, name: "Refunds", workspaceId },
  });
  const make = (caseKey: string, extra: object = {}) =>
    prisma.evalCase.create({
      data: {
        caseKey,
        datasetId: created.id,
        expected: "5 days",
        id: `case-${workspaceId}-${caseKey}`,
        message: `question ${caseKey}`,
        metric: "contains",
        workspaceId,
        ...extra,
      },
    });
  return { created, make };
}

/** The worker side: runs the job the API enqueued. */
const drain = async () => {
  for (const job of mocks.jobs.splice(0)) await execution.processEvalRun({ data: job });
};

it("keeps evaluation Runs Admin-only and inside the caller's Workspace", async () => {
  mocks.current.userId = "agent-a1";
  expect((await call("/eval-runs")).status).toBe(403);
  const { make } = await dataset();
  await make("a");
  await destination("wa1");

  mocks.current.userId = "admin-b";
  const body = { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" };
  expect((await call("/eval-runs/estimate", "POST", body, "wb")).status).toBe(404);
  expect((await call("/eval-runs", "POST", body, "wb")).status).toBe(404);
  expect((await call("/eval-runs", "POST", body, "wa1")).status).toBe(403);
});

it("refuses to start incomplete, unsupported-metric or destination-less selections", async () => {
  mocks.current.userId = "admin-a1";
  const { make } = await dataset();
  await make("draft", { expected: "" });
  await make("unknown", { metric: "bogus" });
  await make("ok");
  const start = (ids: string[]) =>
    call("/eval-runs", "POST", { caseIds: ids.map((id) => `case-wa1-${id}`), datasetId: "ds-wa1" });

  const incomplete = await start(["draft"]);
  expect(incomplete.status).toBe(422);
  expect(await incomplete.json()).toMatchObject({ caseKeys: ["draft"], error: "incomplete_cases" });
  expect((await (await start(["unknown"])).json()).error).toBe("metric_not_enabled");
  expect((await (await start(["ok"])).json()).error).toBe("destination_required");
  expect((await call("/eval-runs", "POST", { caseIds: [], datasetId: "ds-wa1" })).status).toBe(400);
  expect(
    (
      await call("/eval-runs", "POST", {
        caseIds: Array.from({ length: 101 }, (_, i) => `c${i}`),
        datasetId: "ds-wa1",
      })
    ).status,
  ).toBe(400);
  expect(mocks.jobs).toEqual([]);
});

it("runs only the selected Cases once, charges them, and reports to both destinations", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  await destination("wb", "other.test");
  const { make } = await dataset();
  await make("a", {
    history: [
      { content: "Hi", role: "user" },
      { content: "Hello", role: "assistant" },
    ],
  });
  await make("b");
  await make("unselected");
  await make("boom", { message: "boom", expected: "x" });

  const selection = { caseIds: ["case-wa1-a", "case-wa1-b", "case-wa1-boom"], datasetId: "ds-wa1" };
  const estimate = (await (await call("/eval-runs/estimate", "POST", selection)).json()).estimate;
  expect(estimate).toMatchObject({ caseCount: 3, judgeCredits: 0, sufficient: true });
  expect(estimate.credits).toBe(3 * estimate.modelRate);

  const started = await call("/eval-runs", "POST", selection);
  expect(started.status).toBe(201);
  const { run } = await started.json();
  expect(run).toMatchObject({ datasetName: "Refunds", status: "QUEUED" });
  expect(JSON.stringify(run)).not.toContain("credentialsEncrypted");
  expect(mocks.jobs).toEqual([{ runId: run.id, workspaceId: "wa1" }]);

  // Edits after start do not change what the Run executes.
  await prisma.evalCase.update({
    data: { message: "edited after start" },
    where: { id: "case-wa1-a" },
  });

  await drain();
  const finished = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(finished).toMatchObject({
    centralDelivery: "DELIVERED",
    progress: { evaluated: 2, executionErrors: 1, passed: 2, total: 3, unexecuted: 0 },
    status: "FINISHED",
    workspaceDelivery: "DELIVERED",
  });
  expect(
    finished.cases.map((c: { caseKey: string; status: string }) => [c.caseKey, c.status]),
  ).toEqual([
    ["a", "EVALUATED"],
    ["b", "EVALUATED"],
    ["boom", "EXECUTION_ERROR"],
  ]);
  expect(finished.cases[0]).toMatchObject({
    sourceCaseId: "case-wa1-a",
    message: "question a",
    expected: "5 days",
    result: { decision: "REPLY" },
  });
  expect(typeof finished.cases[0].result.answer).toBe("string");
  expect(finished.cases[0].result.checks.length).toBeGreaterThan(0);
  expect(finished.cases[0].result.checks[0]).toMatchObject({ outcome: "pass" });
  expect(mocks.turn).toHaveBeenCalledTimes(3);
  expect(mocks.turn.mock.calls.map(([params]) => params.customerMessage)).toEqual([
    "question a",
    "question b",
    "boom",
  ]);
  // Fixed history is what the turn saw for that Case, and none of it leaks into the next.
  expect(mocks.memories).toEqual([
    [
      { content: "Hi", role: "user" },
      { content: "Hello", role: "assistant" },
    ],
    [],
    [],
  ]);

  // Two replies were charged; the failed turn was not. Every spend is attributed to the Run and
  // survives the scratch Ticket's removal.
  const spends = await prisma.creditLedgerEntry.findMany({ where: { type: "SPEND" } });
  expect(spends).toHaveLength(2);
  expect(spends.every((entry) => entry.evalRunId === run.id)).toBe(true);
  expect(finished.chargedCredits).toBe(2 * estimate.modelRate);
  expect(await prisma.ticket.count({ where: { title: "AI Agent eval suite" } })).toBe(0);

  // Evidence went to SupportOps' central backend and to this Workspace's destination, with each
  // destination's own credentials, and never to another Workspace's.
  const hosts = new Set(posts.map((post) => new URL(post.url).host));
  expect(hosts).toEqual(new Set(["central.test", "lens.test"]));
  expect(posts.some((post) => post.signal === "logs" && post.url.includes("lens.test"))).toBe(true);
  expect(posts.find((post) => post.url.includes("lens.test"))?.authorization).toBe(
    `Basic ${Buffer.from("pk-wa1:sk-wa1").toString("base64")}`,
  );

  // A duplicate delivery of the same job changes nothing: no model call, no charge.
  await execution.processEvalRun({ data: { runId: run.id, workspaceId: "wa1" } });
  expect(mocks.turn).toHaveBeenCalledTimes(3);
  expect(await prisma.creditLedgerEntry.count({ where: { type: "SPEND" } })).toBe(2);
});

it("admits one active Run per Workspace, even when starts race", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("a");
  const selection = { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" };

  const statuses = (
    await Promise.all([1, 2, 3].map(() => call("/eval-runs", "POST", selection)))
  ).map((response) => response.status);
  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.filter((status) => status === 409)).toHaveLength(2);
  expect(await prisma.evalRun.count()).toBe(1);

  // Once it finishes the Workspace may start another.
  await drain();
  expect((await call("/eval-runs", "POST", selection)).status).toBe(201);
});

it("denies a mutating Tool during evaluation and says so", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("a");
  let toolAnswer = "";
  mocks.turn.mockImplementation(async ({ runtime }) => {
    await runtime.loadTicket();
    const tools = await runtime.tools();
    const cancel = tools.descriptors.find((tool: { name: string }) => tool.name === "cancel_order");
    toolAnswer = String(await tools.execute({ input: {}, toolId: cancel.id }));
    await runtime.reply("REPLY", "Refunds take 5 days.", "p");
  });

  const { run } = await (
    await call("/eval-runs", "POST", { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" })
  ).json();
  await drain();

  expect(toolAnswer).toContain("Denied");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("shop.test"))).toBe(
    false,
  );
  const detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail.cases[0].limitations).toEqual(['Tool "cancel_order" was denied (MUTATING).']);
});

it("stops on Credit Exhaustion and marks the rest unexecuted", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("a");
  await make("b");
  await make("c");
  // Enough for exactly one turn at the Model Rate.
  const rate = (
    await (
      await call("/eval-runs/estimate", "POST", { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" })
    ).json()
  ).estimate.modelRate;
  await prisma.creditLedgerEntry.update({ data: { credits: rate }, where: { id: "grant-a" } });

  const { run } = await (
    await call("/eval-runs", "POST", {
      caseIds: ["case-wa1-a", "case-wa1-b", "case-wa1-c"],
      datasetId: "ds-wa1",
    })
  ).json();
  await drain();

  const detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail).toMatchObject({
    creditExhausted: true,
    progress: { evaluated: 1, unexecuted: 2 },
    status: "FINISHED",
  });
  expect(mocks.turn).toHaveBeenCalledTimes(1);
});

it("never replays a Case that had already started when its job is redelivered", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("a");
  await make("b");
  const { run } = await (
    await call("/eval-runs", "POST", { caseIds: ["case-wa1-a", "case-wa1-b"], datasetId: "ds-wa1" })
  ).json();

  // The worker died while Case "a" was in flight.
  await prisma.evalRun.update({ data: { status: "RUNNING" }, where: { id: run.id } });
  await prisma.evalRunCase.updateMany({
    data: { status: "RUNNING" },
    where: { runId: run.id, caseKey: "a" },
  });
  await drain();

  const detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail.cases.map((c: { status: string }) => c.status)).toEqual([
    "EXECUTION_ERROR",
    "EVALUATED",
  ]);
  expect(mocks.turn).toHaveBeenCalledTimes(1);
  expect(mocks.turn.mock.calls[0]?.[0].customerMessage).toBe("question b");
});

it("keeps evidence a destination refused and reports delivery separately from execution", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1", "broken.test");
  const { make } = await dataset();
  await make("a");
  failHost = "broken.test";

  const { run } = await (
    await call("/eval-runs", "POST", { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" })
  ).json();
  await drain();

  const detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail).toMatchObject({
    centralDelivery: "DELIVERED",
    progress: { evaluated: 1 },
    status: "FINISHED",
    workspaceDelivery: "PENDING",
  });
  expect(mocks.deliveries).toEqual([{ runId: run.id, target: "WORKSPACE", workspaceId: "wa1" }]);
  const evidence = await prisma.evalRunEvidence.findMany({ where: { runId: run.id } });
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence.every((row) => row.target === "WORKSPACE" && row.body.includes("resource"))).toBe(
    true,
  );
  // Retained without another model call or another charge.
  expect(mocks.turn).toHaveBeenCalledTimes(1);
  expect(await prisma.creditLedgerEntry.count({ where: { type: "SPEND" } })).toBe(1);
});

const detail = async (id: string) => (await (await call(`/eval-runs/${id}`)).json()).run;
const startRun = async (...keys: string[]) =>
  (
    await (
      await call("/eval-runs", "POST", {
        caseIds: keys.map((key) => `case-wa1-${key}`),
        datasetId: "ds-wa1",
      })
    ).json()
  ).run;
const spends = (kind: "AI_TURN" | "JUDGE") =>
  prisma.creditLedgerEntry.findMany({ where: { chargeKind: kind, type: "SPEND" } });
const statuses = (run: { cases: Array<{ status: string }> }) => run.cases.map((c) => c.status);

it("estimates AI Agent and Judge Credits separately, with a range for Judge calls", async () => {
  mocks.current.userId = "admin-a1";
  const { make } = await dataset();
  await make("plain");
  await make("geval", { metric: "gEval" });
  await make("relevancy", { expected: "", metric: "relevancy" });
  await make("faith", { expected: "", metric: "faithfulness" });
  await make("retriever", {
    expected: "",
    metadata: { expectedPassages: [{ fragment: "x", source: "y" }], retrievalTarget: "retriever" },
    metric: "retrieval",
  });
  await make("control", { expected: "", metric: "negativeControl" });

  const all = ["plain", "geval", "relevancy", "faith", "retriever", "control"];
  const { estimate } = await (
    await call("/eval-runs/estimate", "POST", {
      caseIds: all.map((key) => `case-wa1-${key}`),
      datasetId: "ds-wa1",
    })
  ).json();
  // Retriever-only and evaluator-health Cases make no AI Agent call, so they are not AI Turns.
  expect(estimate).toMatchObject({
    agentTurns: 4,
    evaluatorHealthCases: 1,
    judgeCallsMax: 7,
    judgeCallsMin: 5,
    judgeCredits: 7,
    judgeCreditsMin: 5,
    judgeRate: 1,
    sufficient: true,
  });
  expect(estimate.credits).toBe(4 * estimate.modelRate);
  expect(estimate.totalCredits).toBe(estimate.credits + 7);
});

it("charges every successful Judge call apart from the AI Turn, recording actual usage", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("geval", { metric: "gEval" });
  await make("relevancy", { expected: "", metric: "relevancy" });
  await make("plain");

  const run = await startRun("geval", "relevancy", "plain");
  await drain();

  const finished = await detail(run.id);
  expect(
    finished.cases.map((c: { caseKey: string; judgeCalls: number; status: string }) => [
      c.caseKey,
      c.status,
      c.judgeCalls,
    ]),
  ).toEqual([
    ["geval", "EVALUATED", 2],
    ["relevancy", "EVALUATED", 3],
    ["plain", "EVALUATED", 0],
  ]);
  // Two and three Judge calls within one metric each; the deterministic Case adds no Judge charge.
  const judge = await spends("JUDGE");
  expect(judge).toHaveLength(5);
  expect(judge.every((entry) => entry.credits === -1 && entry.evalRunId === run.id)).toBe(true);
  expect(judge.every((entry) => entry.inputTokens === 10 && entry.outputTokens === 5)).toBe(true);
  expect(judge.every((entry) => entry.judgeModel && entry.evalCaseKey)).toBe(true);
  expect(judge.filter((entry) => entry.evalCaseKey === "relevancy")).toHaveLength(3);
  const turns = await spends("AI_TURN");
  expect(turns).toHaveLength(3);
  expect(mocks.judge.calls).toBe(5);
  expect(finished).toMatchObject({ judgeCallsCharged: 5, judgeCharged: 5 });
  expect(finished.agentCharged).toBe(3 * (turns[0]?.modelRate ?? 0));
  expect(finished.chargedCredits).toBe(finished.agentCharged + 5);
});

it("does not charge a failed Judge call and reports it as an execution error", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("geval", { metric: "gEval" });
  mocks.judge.failOn = 2; // the scoring call, after the steps call succeeded

  const run = await startRun("geval");
  await drain();

  const finished = await detail(run.id);
  expect(finished.cases[0]).toMatchObject({ judgeCalls: 1, status: "EXECUTION_ERROR" });
  expect(finished.cases[0].error).toContain("not charged");
  expect(await spends("JUDGE")).toHaveLength(1);
  // The AI Agent's own answer was still produced and charged under the existing rules.
  expect(await spends("AI_TURN")).toHaveLength(1);
  expect(finished.creditExhausted).toBe(false);
});

it("stops Judge work at Credit Exhaustion, keeps the answer, and marks the Case ungraded", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("geval", { metric: "gEval" });
  await make("next");
  const rate = (
    await (
      await call("/eval-runs/estimate", "POST", { caseIds: ["case-wa1-next"], datasetId: "ds-wa1" })
    ).json()
  ).estimate.modelRate;
  // The AI Turn and exactly one Judge call are affordable; the second Judge call is not.
  await prisma.creditLedgerEntry.update({ data: { credits: rate + 1 }, where: { id: "grant-a" } });

  const run = await startRun("geval", "next");
  await drain();

  const finished = await detail(run.id);
  expect(finished).toMatchObject({ creditExhausted: true, status: "FINISHED" });
  expect(statuses(finished)).toEqual(["UNGRADED", "UNEXECUTED"]);
  expect(finished.progress).toMatchObject({
    evaluated: 0,
    executionErrors: 0,
    ungraded: 1,
    unexecuted: 1,
  });
  expect(mocks.judge.calls).toBe(1);
  expect(mocks.turn).toHaveBeenCalledTimes(1);
  expect(await spends("JUDGE")).toHaveLength(1);
});

it("runs a retriever-only Case without an AI Turn and reports a stale label as invalid, not zero", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  const stale = { expectedPassages: [{ fragment: "gone", source: "Removed FAQ" }] };
  await make("retriever", {
    expected: "",
    metadata: { ...stale, retrievalTarget: "retriever" },
    metric: "retrieval",
  });
  await make("full-turn", { expected: "", metadata: stale, metric: "retrieval" });

  const run = await startRun("retriever", "full-turn");
  await drain();

  const finished = await detail(run.id);
  expect(statuses(finished)).toEqual(["INVALID", "INVALID"]);
  expect(finished.cases[0].error).toContain("no longer resolves");
  expect(finished.progress).toMatchObject({
    evaluated: 0,
    executionErrors: 0,
    invalid: 2,
    passed: 0,
  });
  // The retriever path searched with no AI Agent call; only the full-turn Case ran an AI Turn.
  expect(mocks.retrieverSearches).toBe(1);
  expect(mocks.turn).toHaveBeenCalledTimes(1);
  expect(await spends("AI_TURN")).toHaveLength(1);
  expect(await spends("JUDGE")).toHaveLength(0);
});

it("runs a negative control only as an evaluator-health check: free, and never a regression", async () => {
  mocks.current.userId = "admin-a1";
  await destination("wa1");
  const { make } = await dataset();
  await make("control", { expected: "", metric: "negativeControl" });
  await make("plain");

  const first = await startRun("plain");
  await drain();
  // The selected subset is exactly what ran: no control was added to it.
  expect((await detail(first.id)).cases.map((c: { caseKey: string }) => c.caseKey)).toEqual([
    "plain",
  ]);

  const second = await startRun("control");
  await drain();
  const finished = await detail(second.id);
  expect(finished.cases[0]).toMatchObject({
    evaluatorHealth: true,
    passed: true,
    status: "EVALUATED",
  });
  expect(finished.progress).toMatchObject({ evaluatorChecks: 1, evaluatorHealthy: 1, passed: 0 });
  expect(mocks.turn).toHaveBeenCalledTimes(1); // only "plain"
  expect(finished.chargedCredits).toBe(0);
});

it("retries one destination from stored evidence with no model call or Credits", async () => {
  const delivery = await import("./delivery");
  mocks.current.userId = "admin-a1";
  await destination("wa1", "broken.test");
  const { make } = await dataset();
  await make("a");
  failHost = "broken.test";
  const { run } = await (
    await call("/eval-runs", "POST", { caseIds: ["case-wa1-a"], datasetId: "ds-wa1" })
  ).json();
  await drain();
  const spent = await prisma.creditLedgerEntry.count();
  const job = (attemptsMade: number) =>
    ({
      attemptsMade,
      data: mocks.deliveries[0],
      opts: { attempts: 2 },
    }) as never;

  // Still down: the first attempt asks the queue to retry, the last one ends in a terminal error.
  await expect(delivery.processEvalDelivery(job(0))).rejects.toThrow();
  await delivery.processEvalDelivery(job(1));
  let detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail).toMatchObject({
    centralDelivery: "DELIVERED",
    workspaceDelivery: "ERROR",
    workspaceRetryable: true,
  });

  // Once retention lapses the evidence can no longer be retried.
  await prisma.evalRunEvidence.updateMany({
    data: { expiresAt: new Date(0) },
    where: { runId: run.id },
  });
  expect((await call(`/eval-runs/${run.id}/delivery/WORKSPACE/retry`, "POST")).status).toBe(409);
  await prisma.evalRunEvidence.updateMany({
    data: { expiresAt: new Date(Date.now() + 60_000) },
    where: { runId: run.id },
  });

  // Recovered: an Admin retry inside retention delivers it and leaves central untouched.
  failHost = "";
  const ok = await call(`/eval-runs/${run.id}/delivery/WORKSPACE/retry`, "POST");
  expect(ok.status).toBe(200);
  await delivery.processEvalDelivery(job(0));
  detail = (await (await call(`/eval-runs/${run.id}`)).json()).run;
  expect(detail).toMatchObject({ centralDelivery: "DELIVERED", workspaceDelivery: "DELIVERED" });
  expect(mocks.turn).toHaveBeenCalledTimes(1);
  expect(await prisma.creditLedgerEntry.count()).toBe(spent);
});
