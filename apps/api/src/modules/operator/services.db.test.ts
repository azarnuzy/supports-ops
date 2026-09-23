import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let getModelMargin: typeof import("./services").getModelMargin;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ getModelMargin } = await import("./services"));
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
