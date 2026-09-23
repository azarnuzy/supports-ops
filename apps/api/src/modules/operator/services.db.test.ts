import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let getModelMargin: typeof import("./services").getModelMargin;
let getOperatorOverview: typeof import("./services").getOperatorOverview;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ getModelMargin } = await import("./services"));
  ({ getOperatorOverview } = await import("./services"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

it("reconciles charged Credits across Workspaces and excludes unlimited turns from USD per Credit", async () => {
  const workspaces = [randomUUID(), randomUUID()];
  await prisma.workspace.createMany({
    data: workspaces.map((id, index) => ({ id, name: `Workspace ${index}`, slug: id })),
  });
  const spend = (workspaceId: string, agentModel: string, credits: number, providerCostUsd: number, createdAt: Date) =>
    prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId, type: "SPEND", agentModel, credits, providerCostUsd, createdAt },
    });
  const inRange = new Date("2026-09-23T12:00:00Z");
  await spend(workspaces[0], "model-a", -2, 0.04, inRange);
  await spend(workspaces[1], "model-a", -2, 0.06, inRange);
  await spend(workspaces[1], "model-a", 0, 0.20, inRange);
  await spend(workspaces[0], "model-b", 0, 0.03, inRange);
  await spend(workspaces[0], "model-a", -2, 0.50, new Date("2026-09-22T12:00:00Z"));

  const result = await getModelMargin({ from: "2026-09-23", to: "2026-09-23" });
  const ledger = await prisma.creditLedgerEntry.aggregate({
    where: { type: "SPEND", createdAt: { gte: new Date("2026-09-23"), lt: new Date("2026-09-24") } },
    _sum: { credits: true },
  });

  expect(result.models.reduce((sum, model) => sum + model.creditsCharged, 0)).toBe(-ledger._sum.credits!);
  expect(result.models[0]).toMatchObject({
    agentModel: "model-a", aiTurns: 3, unlimitedTurns: 1, creditsCharged: 4,
  });
  expect(result.models[0].providerCostUsd).toBeCloseTo(0.3);
  expect(result.models[0].usdPerCredit).toBeCloseTo(0.025);
  expect(result.models[1]).toEqual({
    agentModel: "model-b", aiTurns: 1, unlimitedTurns: 1,
    creditsCharged: 0, providerCostUsd: 0.03, usdPerCredit: null,
  });
});

it("adds two Workspace figures without exposing customer content", async () => {
  const workspaceIds = [randomUUID(), randomUUID()];
  const now = new Date("2026-09-23T12:00:00.000Z");
  for (const [index, workspaceId] of workspaceIds.entries()) {
    await prisma.workspace.create({
      data: { id: workspaceId, name: `Workspace ${index}`, slug: `workspace-${workspaceId}`, createdAt: now },
    });
    const aiAgentId = randomUUID();
    const channelId = randomUUID();
    const customerIdentityId = randomUUID();
    const sessionId = randomUUID();
    await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
    await prisma.channel.create({
      data: { id: channelId, aiAgentId, name: "Channel", type: index ? "WHATSAPP" : "WEB", workspaceId },
    });
    await prisma.customerIdentity.create({
      data: { id: customerIdentityId, workspaceId, channelType: index ? "WHATSAPP" : "WEB", canonicalId: `secret-${index}`, name: "Secret Customer" },
    });
    await prisma.session.create({
      data: { id: sessionId, workspaceId, channelId, customerIdentityId, createdAt: now },
    });
    await prisma.ticket.create({
      data: { id: randomUUID(), workspaceId, channelId, aiAgentId, customerIdentityId, sessionId, title: "Secret ticket", status: index ? "RESOLVED" : "AI_HANDLING", resolutionReason: index ? "CUSTOMER_CONFIRMED" : null, createdAt: now },
    });
    await prisma.creditLedgerEntry.createMany({
      data: [
        { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 500, createdAt: now },
        { id: randomUUID(), workspaceId, type: "TOP_UP", credits: 100, createdAt: now },
        { id: randomUUID(), workspaceId, type: "SPEND", credits: -(index + 1), providerCostUsd: 0.01 * (index + 1), createdAt: now },
      ],
    });
    await prisma.topUpPayment.create({
      data: { id: randomUUID(), workspaceId, packId: "test", credits: 100, amountIdr: 10000 * (index + 1), status: "PAID", mayarPaymentId: randomUUID(), checkoutUrl: "https://example.com", expiresAt: now, paidAt: now, createdAt: now },
    });
  }

  const range = { from: "2026-09-23", to: "2026-09-23" };
  const all = await getOperatorOverview(range);
  const perWorkspace = await Promise.all(workspaceIds.map((id) => getOperatorOverview(range, id)));
  for (const path of [
    (overview: typeof all) => overview.workspaces.total,
    (overview: typeof all) => overview.workspaces.new,
    (overview: typeof all) => overview.sessions.WEB,
    (overview: typeof all) => overview.sessions.WHATSAPP,
    (overview: typeof all) => overview.tickets.byStatus.AI_HANDLING,
    (overview: typeof all) => overview.tickets.byStatus.RESOLVED,
    (overview: typeof all) => overview.tickets.byResolutionReason.CUSTOMER_CONFIRMED,
    (overview: typeof all) => overview.credits.spent,
    (overview: typeof all) => overview.credits.topUps,
    (overview: typeof all) => overview.credits.trialGrants,
    (overview: typeof all) => overview.revenueIdr,
    (overview: typeof all) => overview.providerCostUsd,
  ]) {
    expect(path(all)).toBe(perWorkspace.reduce((sum, overview) => sum + path(overview), 0));
  }
  expect(JSON.stringify(all)).not.toMatch(/Secret|canonicalId|message|attachment/i);
});
