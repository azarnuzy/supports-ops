import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const sessions = vi.hoisted(() => ({ operator: false, workspaceId: "" }));
vi.mock("../auth/instance", () => ({
  auth: {
    api: {
      getSession: async () =>
        sessions.workspaceId
          ? {
              session: { id: "admin-session" },
              user: { id: "admin", role: "ADMIN", workspaceId: sessions.workspaceId },
            }
          : null,
    },
  },
  operatorAuth: {
    api: {
      getSession: async () =>
        sessions.operator
          ? { session: { id: "operator-session" }, user: { id: "operator", disabledAt: null } }
          : null,
    },
  },
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;
let firstId: string;
let secondId: string;

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

beforeEach(async () => {
  await truncateAll(prisma);
  sessions.operator = false;
  sessions.workspaceId = "";
  firstId = randomUUID();
  secondId = randomUUID();
  await prisma.workspace.createMany({
    data: [
      { id: firstId, name: "Alpha", slug: "alpha" },
      { id: secondId, name: "Beta", slug: "beta" },
      { id: randomUUID(), name: "Deleted", slug: "deleted", deletedAt: new Date() },
    ],
  });
  await prisma.creditLedgerEntry.createMany({
    data: [
      { id: randomUUID(), workspaceId: firstId, type: "TRIAL_GRANT", credits: 500 },
      { id: randomUUID(), workspaceId: firstId, type: "SPEND", credits: -3 },
      { id: randomUUID(), workspaceId: secondId, type: "TRIAL_GRANT", credits: 500 },
    ],
  });
});

it("guards, searches, and paginates Workspaces without deleted rows", async () => {
  expect((await app.request("/operator/workspaces")).status).toBe(401);
  sessions.workspaceId = firstId;
  expect((await app.request("/operator/workspaces")).status).toBe(401);
  sessions.workspaceId = "";
  sessions.operator = true;

  const page = await app.request("/operator/workspaces?limit=1&page=2");
  expect(page.status).toBe(200);
  expect((await page.json()).total).toBe(2);
  expect(
    (await (await app.request("/operator/workspaces?search=ALP")).json()).workspaces,
  ).toMatchObject([
    { id: firstId, balance: 497, creditSpend30Days: 3, activeUnlimitedPeriod: null },
  ]);
  expect((await (await app.request("/operator/workspaces?search=deleted")).json()).total).toBe(0);
});

it("surfaces an active Unlimited Period in the Workspace list", async () => {
  const operatorId = randomUUID();
  await prisma.operator.create({ data: { id: operatorId, name: "Op", email: `${operatorId}@example.com` } });
  const endAt = new Date(Date.now() + 60_000);
  await prisma.unlimitedPeriod.create({
    data: { id: randomUUID(), workspaceId: firstId, operatorId, endAt },
  });
  sessions.operator = true;

  const { workspaces } = await (await app.request("/operator/workspaces?search=ALP")).json();

  expect(workspaces).toMatchObject([{ id: firstId, activeUnlimitedPeriod: { endAt: endAt.toISOString() } }]);

  const detail = await (await app.request(`/operator/workspaces/${firstId}`)).json();
  expect(detail.unlimitedPeriod).toMatchObject({ endAt: endAt.toISOString(), endedEarlyAt: null });
});

it("returns the same analytics and AI Usage as the Workspace Admin", async () => {
  sessions.workspaceId = firstId;
  const adminOverview = (await (await app.request("/analytics/overview")).json()).analytics;
  const adminTraffic = (await (await app.request("/analytics/traffic")).json()).analytics;
  const adminUsage = (await (await app.request("/ai-usage/summary")).json()).aiUsage;
  const adminTools = (await (await app.request("/ai-usage/tools")).json()).toolUsage;
  sessions.workspaceId = "";
  sessions.operator = true;

  const response = await app.request(`/operator/workspaces/${firstId}`);
  expect(response.status).toBe(200);
  const detail = await response.json();
  expect(detail.analytics).toEqual({ overview: adminOverview, traffic: adminTraffic });
  expect(detail.aiUsage).toEqual({ summary: adminUsage, tools: adminTools });
  expect(JSON.stringify(detail)).not.toContain("accessToken");
  expect((await app.request(`/operator/workspaces/${secondId}`)).status).toBe(200);
  expect((await app.request("/operator/workspaces/missing")).status).toBe(404);
});
