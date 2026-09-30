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
    issues: ["Choose a metric."],
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
