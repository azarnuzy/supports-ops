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
  expect(((await page.json()) as { total: number }).total).toBe(2);
  expect(
    (
      (await (await app.request("/operator/workspaces?search=ALP")).json()) as {
        workspaces: unknown;
      }
    ).workspaces,
  ).toMatchObject([
    { id: firstId, balance: 497, creditsUsed: 3, activeUnlimitedPeriod: null },
  ]);
  expect(
    ((await (await app.request("/operator/workspaces?search=deleted")).json()) as { total: number })
      .total,
  ).toBe(0);
});

it("sorts by name and filters to a single attention condition before paginating", async () => {
  sessions.operator = true;

  const byName = (await (await app.request("/operator/workspaces?sortBy=name")).json()) as {
    workspaces: { name: string }[];
  };
  expect(byName.workspaces.map((workspace) => workspace.name)).toEqual(["Alpha", "Beta"]);

  const lowBalanceId = randomUUID();
  await prisma.workspace.create({ data: { id: lowBalanceId, name: "Gamma", slug: "gamma" } });
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId: lowBalanceId, type: "TRIAL_GRANT", credits: 10 },
  });

  const filtered = (await (
    await app.request("/operator/workspaces?attention=LOW_BALANCE")
  ).json()) as { workspaces: { id: string }[]; total: number };
  expect(filtered.total).toBe(1);
  expect(filtered.workspaces).toMatchObject([{ id: lowBalanceId, balance: 10 }]);
});

it("sorts aggregate values before pagination and applies health filters", async () => {
  sessions.operator = true;
  const first = (await (await app.request("/operator/workspaces?sortBy=balance&sortDirection=asc&limit=1")).json()) as {
    workspaces: { id: string; conditions: string[]; creditsUsed: number }[];
    total: number;
  };
  expect(first.total).toBe(2);
  expect(first.workspaces[0]).toMatchObject({ id: firstId, creditsUsed: 3 });
  expect(first.workspaces[0].conditions).toContain("INACTIVE");

  const healthy = (await (await app.request("/operator/workspaces?status=HEALTHY")).json()) as { total: number };
  expect(healthy.total).toBe(0);
});

it("surfaces an active Unlimited Period in the Workspace list", async () => {
  const operatorId = randomUUID();
  await prisma.operator.create({
    data: { id: operatorId, name: "Op", email: `${operatorId}@example.com` },
  });
  const endAt = new Date(Date.now() + 60_000);
  await prisma.unlimitedPeriod.create({
    data: { id: randomUUID(), workspaceId: firstId, operatorId, endAt },
  });
  sessions.operator = true;

  const { workspaces } = (await (await app.request("/operator/workspaces?search=ALP")).json()) as {
    workspaces: unknown;
  };

  expect(workspaces).toMatchObject([
    { id: firstId, activeUnlimitedPeriod: { endAt: endAt.toISOString() } },
  ]);

  const detail = (await (await app.request(`/operator/workspaces/${firstId}`)).json()) as {
    unlimitedPeriod: unknown;
  };
  expect(detail.unlimitedPeriod).toMatchObject({ endAt: endAt.toISOString(), endedEarlyAt: null });
});

it("returns the same analytics and AI Usage as the Workspace Admin", async () => {
  sessions.workspaceId = firstId;
  const adminOverview = (
    (await (await app.request("/analytics/overview")).json()) as { analytics: unknown }
  ).analytics;
  const adminTraffic = (
    (await (await app.request("/analytics/traffic")).json()) as { analytics: unknown }
  ).analytics;
  const adminUsage = (
    (await (await app.request("/ai-usage/summary")).json()) as { aiUsage: unknown }
  ).aiUsage;
  const adminTools = (
    (await (await app.request("/ai-usage/tools")).json()) as { toolUsage: unknown }
  ).toolUsage;
  sessions.workspaceId = "";
  sessions.operator = true;

  const response = await app.request(`/operator/workspaces/${firstId}`);
  expect(response.status).toBe(200);
  const detail = (await response.json()) as {
    analytics: unknown;
    aiUsage: unknown;
    attention: { balance: number };
    sessions: { count: number; previousCount: number; daily: { count: number }[] };
    billing: { spentThisMonth: number };
    outcomes: unknown[];
  };
  expect(detail.analytics).toEqual({ overview: adminOverview, traffic: adminTraffic });
  expect(detail.aiUsage).toEqual({ summary: adminUsage, tools: adminTools });
  expect(detail.attention.balance).toBe(497);
  expect(detail.sessions.count).toBe(0);
  expect(detail.sessions.previousCount).toBe(0);
  expect(detail.sessions.daily).toHaveLength(7);
  expect(detail.outcomes).toEqual([]);
  expect(detail.billing.spentThisMonth).toBe(3);
  expect(JSON.stringify(detail)).not.toContain("accessToken");
  expect((await app.request(`/operator/workspaces/${secondId}`)).status).toBe(200);
  expect((await app.request("/operator/workspaces/missing")).status).toBe(404);
});
