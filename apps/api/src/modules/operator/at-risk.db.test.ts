import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const sessions = vi.hoisted(() => ({ operator: false }));
vi.mock("../auth/instance", () => ({
  auth: { api: { getSession: async () => null } },
  operatorAuth: {
    api: {
      getSession: async () =>
        sessions.operator
          ? { session: { id: "operator-session" }, user: { id: "operator", disabledAt: null } }
          : null,
    },
  },
}));

type AtRiskWorkspace = { id: string; conditions: string[] };

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;
let operatorId: string;

async function fetchAtRisk() {
  const response = await app.request("/operator/at-risk");
  const { workspaces } = (await response.json()) as { workspaces: AtRiskWorkspace[] };
  return workspaces;
}

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
  sessions.operator = true;
  operatorId = randomUUID();
  await prisma.operator.create({
    data: { id: operatorId, name: "Op", email: `${operatorId}@example.com` },
  });
});

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function createWorkspace(name: string) {
  const id = randomUUID();
  await prisma.workspace.create({ data: { id, name, slug: id } });
  return id;
}

async function recordActivity(workspaceId: string, customerLastMessageAt: Date) {
  const aiAgentId = randomUUID();
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
  const channelId = randomUUID();
  await prisma.channel.create({
    data: { aiAgentId, id: channelId, name: "Web", type: "WEB", workspaceId },
  });
  const customerIdentityId = randomUUID();
  await prisma.customerIdentity.create({
    data: {
      canonicalId: `${workspaceId}@test`,
      channelType: "WEB",
      email: `${workspaceId}@test`,
      id: customerIdentityId,
      name: "Customer",
      workspaceId,
    },
  });
  await prisma.session.create({
    data: { channelId, customerIdentityId, customerLastMessageAt, id: randomUUID(), workspaceId },
  });
}

it("flags a Workspace below the low-balance threshold", async () => {
  const workspaceId = await createWorkspace("Low");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 50 },
  });
  await recordActivity(workspaceId, new Date());

  const workspaces = await fetchAtRisk();

  expect(workspaces).toMatchObject([{ id: workspaceId, conditions: ["LOW_BALANCE"] }]);
});

it("flags a Workspace at Credit Exhaustion", async () => {
  const workspaceId = await createWorkspace("Exhausted");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "SPEND", credits: 0 },
  });
  await recordActivity(workspaceId, new Date());

  const workspaces = await fetchAtRisk();

  expect(workspaces).toMatchObject([{ id: workspaceId, conditions: ["CREDIT_EXHAUSTED"] }]);
});

it("does not flag balance for a Workspace on an active Unlimited Period, even at zero balance", async () => {
  const workspaceId = await createWorkspace("Unlimited");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "SPEND", credits: 0 },
  });
  await prisma.unlimitedPeriod.create({
    data: { id: randomUUID(), workspaceId, operatorId, endAt: daysAgo(-30) },
  });
  await recordActivity(workspaceId, new Date());

  const workspaces = await fetchAtRisk();

  expect(workspaces).toEqual([]);
});

it("flags a Workspace whose Unlimited Period ends within 7 days", async () => {
  const workspaceId = await createWorkspace("Ending soon");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 500 },
  });
  await prisma.unlimitedPeriod.create({
    data: { id: randomUUID(), workspaceId, operatorId, endAt: daysAgo(-3) },
  });
  await recordActivity(workspaceId, new Date());

  const workspaces = await fetchAtRisk();

  expect(workspaces).toMatchObject([{ id: workspaceId, conditions: ["UNLIMITED_ENDING_SOON"] }]);
});

it("flags a Workspace with no Customer activity for 14 days, including no activity at all", async () => {
  const stale = await createWorkspace("Stale");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId: stale, type: "TRIAL_GRANT", credits: 500 },
  });
  await recordActivity(stale, daysAgo(15));

  const never = await createWorkspace("Never active");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId: never, type: "TRIAL_GRANT", credits: 500 },
  });

  const workspaces = await fetchAtRisk();

  expect(workspaces.map((w) => [w.id, w.conditions]).sort()).toEqual(
    [
      [stale, ["INACTIVE"]],
      [never, ["INACTIVE"]],
    ].sort(),
  );
});

it("lists a Workspace matching several conditions once, with every condition", async () => {
  const workspaceId = await createWorkspace("Multi");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "SPEND", credits: 0 },
  });
  await recordActivity(workspaceId, daysAgo(20));

  const workspaces = await fetchAtRisk();

  expect(workspaces).toMatchObject([
    { id: workspaceId, conditions: ["CREDIT_EXHAUSTED", "INACTIVE"] },
  ]);
});

it("leaves a healthy Workspace out", async () => {
  const workspaceId = await createWorkspace("Healthy");
  await prisma.creditLedgerEntry.create({
    data: { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 500 },
  });
  await recordActivity(workspaceId, new Date());

  const workspaces = await fetchAtRisk();

  expect(workspaces).toEqual([]);
});
