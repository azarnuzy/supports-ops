import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ userId: "" }));
vi.mock("../auth/instance", () => ({
  auth: {
    api: {
      getSession: async () =>
        current.userId
          ? { session: { id: "s" }, user: { id: current.userId, role: "ADMIN" } }
          : null,
    },
  },
  operatorAuth: { api: { getSession: async () => null } },
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ app } = await import("../../app"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

/** org-a has workspaces wa1 + wa2; org-b has wb. `admin-a1` is a Workspace Admin of wa1,
 * `org-admin-a` an Organization Admin of org-a, `agent-a1` a Human Agent of wa1. */
beforeEach(async () => {
  await truncateAll(prisma);
  current.userId = "";
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
  const user = (id: string, organizationId: string, isOrganizationAdmin = false) => ({
    email: `${id}@x.test`,
    id,
    isOrganizationAdmin,
    name: id,
    organizationId,
    role: "ADMIN" as const,
  });
  await prisma.user.createMany({
    data: [
      user("admin-a1", "org-a"),
      user("org-admin-a", "org-a", true),
      { ...user("agent-a1", "org-a"), role: "HUMAN_AGENT" },
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
});

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Reply = { json(): Promise<any> } & Response;
const call = (path: string, method = "GET", body?: unknown, workspace?: string) =>
  app.request(`/eval-datasets${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(workspace ? { "x-workspace-id": workspace } : {}),
    },
    method,
  }) as Promise<Reply>;

const draftCase = { caseKey: "refund-window", message: "How long do refunds take?" };

it("denies unauthenticated callers and Human Agents", async () => {
  expect((await call("")).status).toBe(403);
  current.userId = "agent-a1";
  expect((await call("")).status).toBe(403);
  expect((await call("", "POST", { name: "x" })).status).toBe(403);
});

it("persists a dataset and its cases, reporting drafts as incomplete", async () => {
  current.userId = "admin-a1";
  const created = await call("", "POST", { criteria: "Be concise.", name: "Refunds" });
  expect(created.status).toBe(201);
  const { dataset } = await created.json();

  const draft = await call(`/${dataset.id}/cases`, "POST", draftCase);
  expect(draft.status).toBe(201);
  expect((await draft.json()).case).toMatchObject({
    complete: false,
    issues: ["Choose an evaluation type."],
  });

  const complete = await call(`/${dataset.id}/cases`, "POST", {
    caseKey: "cutoff",
    clarificationCount: 1,
    expected: "13:00",
    history: [
      { content: "Hi", role: "user" },
      { content: "Hello", role: "assistant" },
    ],
    message: "Order cutoff?",
    metric: "contains",
  });
  expect((await complete.json()).case).toMatchObject({ complete: true, metric: "contains" });

  const list = (await (await call("")).json()).datasets;
  expect(list).toMatchObject([{ caseCount: 2, incompleteCount: 1, name: "Refunds" }]);

  const detail = (await (await call(`/${dataset.id}`)).json()).dataset;
  expect(detail.cases).toHaveLength(2);
  expect(detail.cases[1].history).toHaveLength(2);
});

it("updates cases and rejects duplicate keys and invalid metric inputs", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "D" })).json();
  const { case: first } = await (await call(`/${dataset.id}/cases`, "POST", draftCase)).json();
  await call(`/${dataset.id}/cases`, "POST", { ...draftCase, caseKey: "other" });

  const duplicate = await call(`/${dataset.id}/cases`, "POST", draftCase);
  expect(duplicate.status).toBe(409);

  expect(
    (await call(`/${dataset.id}/cases`, "POST", { ...draftCase, caseKey: "a", metric: "bogus" }))
      .status,
  ).toBe(400);
  expect(
    (await call(`/${dataset.id}/cases`, "POST", { ...draftCase, caseKey: "a b" })).status,
  ).toBe(400);
  expect(
    (
      await call(`/${dataset.id}/cases`, "POST", {
        ...draftCase,
        caseKey: "c",
        history: [{ content: "x", role: "system" }],
      })
    ).status,
  ).toBe(400);

  const updated = await call(`/${dataset.id}/cases/${first.id}`, "PUT", {
    ...draftCase,
    metadata: { decisions: ["ESCALATE"], script: "rm -rf /" },
    metric: "decision",
  });
  const body = (await updated.json()).case;
  expect(body).toMatchObject({ complete: true, metadata: { decisions: ["ESCALATE"] } });
  expect(body.metadata.script).toBeUndefined();

  const retrieval = await call(`/${dataset.id}/cases/${first.id}`, "PUT", {
    ...draftCase,
    metric: "retrieval",
  });
  expect((await retrieval.json()).case.issues).toEqual(["Add at least one expected passage."]);

  expect((await call(`/${dataset.id}/cases/${first.id}`, "DELETE")).status).toBe(204);
  expect((await call(`/${dataset.id}/cases/${first.id}`, "DELETE")).status).toBe(404);
});

it("keeps every dataset and case ID inside its Workspace", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "Private" })).json();
  const { case: item } = await (await call(`/${dataset.id}/cases`, "POST", draftCase)).json();

  // Another Organization's Admin cannot see, edit, or attach to it by ID.
  current.userId = "admin-b";
  expect((await (await call("")).json()).datasets).toEqual([]);
  expect((await call(`/${dataset.id}`)).status).toBe(404);
  expect((await call(`/${dataset.id}`, "PUT", { name: "x" })).status).toBe(404);
  expect((await call(`/${dataset.id}/cases`, "POST", { ...draftCase, caseKey: "z" })).status).toBe(
    404,
  );
  expect((await call(`/${dataset.id}/cases/${item.id}`, "PUT", draftCase)).status).toBe(404);
  expect((await call(`/${dataset.id}/cases/${item.id}`, "DELETE")).status).toBe(404);
  // …and cannot borrow the Workspace either.
  expect((await call("", "GET", undefined, "wa1")).status).toBe(403);

  // A sibling Workspace of the same Organization is a separate scope.
  current.userId = "org-admin-a";
  expect((await (await call("", "GET", undefined, "wa2")).json()).datasets).toEqual([]);
  expect((await call(`/${dataset.id}`, "GET", undefined, "wa2")).status).toBe(404);
  expect((await (await call("", "GET", undefined, "wa1")).json()).datasets).toHaveLength(1);
  expect((await call(`/${dataset.id}/cases/${item.id}`, "DELETE", undefined, "wa2")).status).toBe(
    404,
  );
  expect(await prisma.evalCase.count()).toBe(1);
});

/** One Session in `workspaceId`: customer, AI reply, customer follow-up (positions 1..3). */
async function seedSession(workspaceId: string, tag: string) {
  await prisma.aiAgent.create({ data: { id: `ag-${tag}`, name: "Agent", workspaceId } });
  await prisma.channel.create({
    data: { aiAgentId: `ag-${tag}`, id: `ch-${tag}`, name: "Web", type: "WEB", workspaceId },
  });
  await prisma.customerIdentity.create({
    data: { canonicalId: tag, channelType: "WEB", id: `ci-${tag}`, name: tag, workspaceId },
  });
  await prisma.session.create({
    data: { channelId: `ch-${tag}`, customerIdentityId: `ci-${tag}`, id: `s-${tag}`, workspaceId },
  });
  await prisma.conversation.create({
    data: {
      id: `cv-${tag}`,
      metadata: {},
      scopeKey: `session:s-${tag}`,
      sessionId: `s-${tag}`,
      userId: `ci-${tag}`,
      workspaceId,
    },
  });
  const turns = [
    ["CUSTOMER", "Where is my order?"],
    ["AI_AGENT", "It ships tomorrow."],
    ["CUSTOMER", "Can I cancel it?"],
  ] as const;
  for (const [index, [senderType, content]] of turns.entries()) {
    await prisma.message.create({
      data: {
        content,
        externalMessageId: `${tag}-${index}`,
        id: `m-${tag}-${index}`,
        memorySessionId: `cv-${tag}`,
        message: {},
        position: index + 1,
        role: senderType === "CUSTOMER" ? "user" : "assistant",
        runId: "r",
        senderType,
        sessionId: `s-${tag}`,
        turn: 1,
        workspaceId,
      },
    });
  }
}

it("imports pasted messages as drafts, previewing without saving", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "D" })).json();
  const body = { source: "paste", text: "first\nline\n---\n\n---\nsecond" };

  const preview = (await (await call(`/${dataset.id}/import/preview`, "POST", body)).json())
    .preview;
  expect(preview.rows.map((r: { errors: string[] }) => r.errors)).toEqual([
    [],
    ["Empty message block."],
    [],
  ]);
  expect((await (await call(`/${dataset.id}`)).json()).dataset.cases).toHaveLength(0);

  const saved = await call(`/${dataset.id}/import`, "POST", body);
  expect(saved.status).toBe(201);
  const { import: result } = await saved.json();
  expect(result.cases).toMatchObject([
    { complete: false, message: "first\nline", metric: null },
    { complete: false, message: "second" },
  ]);
  expect(result.cases[0].caseKey).not.toBe(result.cases[1].caseKey);
});

it("imports structured CSV and skips invalid rows visibly", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "D" })).json();
  const text = "case_id,message,metric,expected\nok,Hi,contains,hello\nbad,Yo,nonsense,";
  const { import: result } = await (
    await call(`/${dataset.id}/import`, "POST", { source: "csv", text })
  ).json();
  expect(result.cases).toMatchObject([{ caseKey: "ok", complete: true }]);
  expect(result.rows[1]).toMatchObject({ case: null, row: 3 });
});

it("imports Session Customer messages with optional history, never an expected answer", async () => {
  current.userId = "admin-a1";
  await seedSession("wa1", "a");
  const { dataset } = await (await call("", "POST", { name: "D" })).json();

  const listed = (await (await call("/import-sessions")).json()).sessions;
  expect(listed).toHaveLength(1);
  expect(listed[0].messages.map((m: { id: string }) => m.id)).toEqual(["m-a-0", "m-a-2"]);

  const { import: result } = await (
    await call(`/${dataset.id}/import`, "POST", {
      selections: [
        { includeHistory: true, messageId: "m-a-2" },
        { includeHistory: false, messageId: "m-a-0" },
      ],
      source: "sessions",
    })
  ).json();
  expect(result.cases[0]).toMatchObject({
    expected: "",
    history: [
      { content: "Where is my order?", role: "user" },
      { content: "It ships tomorrow.", role: "assistant" },
    ],
    message: "Can I cancel it?",
  });
  expect(result.cases[1]).toMatchObject({ history: [], message: "Where is my order?" });
});

it("denies Session sources from other Workspaces and AI replies", async () => {
  await seedSession("wb", "b");
  await seedSession("wa1", "a");
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "D" })).json();
  const { import: result } = await (
    await call(`/${dataset.id}/import`, "POST", {
      selections: [{ messageId: "m-b-0" }, { messageId: "m-a-1" }],
      source: "sessions",
    })
  ).json();
  expect(result.cases).toEqual([]);
  expect(result.rows.every((r: { case: unknown }) => r.case === null)).toBe(true);
  expect((await (await call("/import-sessions")).json()).sessions).toHaveLength(1);
});

it("keeps import Admin-only and scoped to the dataset's Workspace", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "D" })).json();
  const body = { source: "paste", text: "hi" };
  current.userId = "agent-a1";
  expect((await call(`/${dataset.id}/import`, "POST", body)).status).toBe(403);
  expect((await call("/import-sessions")).status).toBe(403);
  current.userId = "admin-b";
  expect((await call(`/${dataset.id}/import/preview`, "POST", body)).status).toBe(404);
});

it("imports every row and pages/searches cases while bulk expectations preserve messages", async () => {
  current.userId = "admin-a1";
  const { dataset } = await (await call("", "POST", { name: "Large dataset" })).json();
  const text = Array.from({ length: 130 }, (_, index) =>
    index === 0 ? "x".repeat(8000) : `Question ${index}`,
  ).join("\n---\n");
  const saved = await (
    await call(`/${dataset.id}/import`, "POST", { source: "paste", text })
  ).json();
  expect(saved.import.cases).toHaveLength(130);
  expect(saved.import.truncated).toBeNull();
  const first = (await (await call(`/${dataset.id}?page=1`)).json()).dataset;
  const second = (await (await call(`/${dataset.id}?page=2`)).json()).dataset;
  expect(first.cases).toHaveLength(25);
  expect(first.caseIndex).toHaveLength(130);
  expect(first.total).toBe(130);
  expect(
    second.cases.every(
      (item: { id: string }) => !first.cases.some((other: { id: string }) => other.id === item.id),
    ),
  ).toBe(true);
  const ids = first.cases.slice(0, 2).map((item: { id: string }) => item.id);
  expect(
    (
      await call(`/${dataset.id}/cases`, "PUT", {
        caseIds: ids,
        metric: "faithfulness",
        expected: "",
        metadata: {},
      })
    ).status,
  ).toBe(200);
  const ready = (await (await call(`/${dataset.id}?status=ready`)).json()).dataset;
  expect(ready.total).toBe(2);
  expect(ready.cases.every((item: { complete: boolean }) => item.complete)).toBe(true);
  expect(first.cases[0].message).toBe(
    saved.import.cases.find((item: { id: string }) => item.id === first.cases[0].id).message,
  );
  const search = (await (await call(`/${dataset.id}?search=Question%20129`)).json()).dataset;
  expect(search.cases).toHaveLength(1);
  expect(search.cases[0].message).toBe("Question 129");
  const sorted = (await (await call(
    `/${dataset.id}?sortBy=message&sortDirection=desc&search=Question`,
  )).json()).dataset;
  expect(sorted.cases[0].message).toBe("Question 129");
  expect(sorted.cases[24].message).toBe("Question 105");
  const sortedReady = (await (await call(
    `/${dataset.id}?sortBy=complete&sortDirection=desc`,
  )).json()).dataset;
  expect(sortedReady.cases.slice(0, 2).every((item: { complete: boolean }) => item.complete)).toBe(true);
  expect(sortedReady.cases[2].complete).toBe(false);
  expect((await call(`/${dataset.id}?sortBy=unknown`)).status).toBe(400);
  const before = ready.cases[0];
  expect(
    (
      await call(`/${dataset.id}/cases`, "PUT", {
        caseIds: [before.id, "other-workspace-case"],
        metric: "language",
        metadata: { language: "id" },
      })
    ).status,
  ).toBe(404);
  expect((await (await call(`/${dataset.id}?status=ready`)).json()).dataset.cases[0].metric).toBe(
    "faithfulness",
  );
});

it("pages and filters Customer Messages directly without exposing other Workspaces", async () => {
  await seedSession("wa1", "a");
  await seedSession("wb", "b");
  for (let index = 0; index < 23; index++)
    await prisma.message.create({
      data: {
        id: `extra-${index}`,
        workspaceId: "wa1",
        sessionId: "s-a",
        memorySessionId: "cv-a",
        runId: "r",
        turn: 1,
        position: index + 4,
        role: "user",
        senderType: "CUSTOMER",
        content: `Need help ${index}`,
        message: {},
        externalMessageId: `extra-${index}`,
      },
    });
  current.userId = "admin-a1";
  const first = await (await call("/import-messages?page=1")).json();
  const second = await (await call("/import-messages?page=2")).json();
  expect(first.total).toBe(25);
  expect(first.messages).toHaveLength(20);
  expect(second.messages).toHaveLength(5);
  expect(
    new Set([...first.messages, ...second.messages].map((item: { id: string }) => item.id)).size,
  ).toBe(25);
  expect(first.messages[0].session.customerIdentity.name).toBe("a");
  expect((await (await call("/import-messages?search=Need%20help&channel=WEB")).json()).total).toBe(
    23,
  );
  expect((await (await call("/import-messages?channel=WHATSAPP")).json()).total).toBe(0);
  current.userId = "agent-a1";
  expect((await call("/import-messages")).status).toBe(403);
});
