import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withWorkspaceContext } from "../../utils/workspace-context";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");
let workspaceId: string;
let otherWorkspaceId: string;
let aiAgentId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  services = await import("./services");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  workspaceId = randomUUID();
  otherWorkspaceId = randomUUID();
  aiAgentId = randomUUID();
  await prisma.workspace.createMany({
    data: [
      { id: workspaceId, name: "Demo", slug: `demo-${workspaceId.slice(0, 8)}` },
      { id: otherWorkspaceId, name: "Other", slug: `other-${otherWorkspaceId.slice(0, 8)}` },
    ],
  });
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
});

function daysAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function seedSpend(params: {
  workspaceId: string;
  aiAgentId?: string | null;
  agentModel?: string | null;
  createdAt: Date;
}) {
  await prisma.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      workspaceId: params.workspaceId,
      type: "SPEND",
      credits: -1,
      aiAgentId: params.aiAgentId ?? null,
      agentModel: params.agentModel ?? null,
      createdAt: params.createdAt,
    },
  });
}

describe("getAiUsageSummary", () => {
  it("sums balance from the ledger and buckets spend by day, AI Agent, and Agent Model", async () => {
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 500 },
    });
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId, type: "TOP_UP", credits: 200 },
    });
    for (let i = 0; i < 3; i++) {
      await seedSpend({
        workspaceId,
        aiAgentId,
        agentModel: "openai/gpt-5.6-luna",
        createdAt: daysAgo(0),
      });
    }
    for (let i = 0; i < 2; i++) {
      await seedSpend({
        workspaceId,
        aiAgentId,
        agentModel: "openai/gpt-5.6-luna",
        createdAt: daysAgo(1),
      });
    }
    // Another Workspace's spend must never leak in.
    await seedSpend({
      workspaceId: otherWorkspaceId,
      agentModel: "other/model",
      createdAt: daysAgo(0),
    });

    const summary = await withWorkspaceContext(workspaceId, () => services.getAiUsageSummary());

    expect(summary.balance).toBe(695);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.at(-1)).toMatchObject({ creditsSpent: 3, turnCount: 3 });
    expect(summary.daily.at(-2)).toMatchObject({ creditsSpent: 2, turnCount: 2 });
    expect(summary.daily.slice(0, -2).every((day) => day.creditsSpent === 0)).toBe(true);
    expect(summary.byAgent).toEqual([
      { aiAgentId, aiAgentName: "AI Agent", creditsSpent: 5, turnCount: 5 },
    ]);
    expect(summary.byModel).toEqual([
      { agentModel: "openai/gpt-5.6-luna", creditsSpent: 5, turnCount: 5 },
    ]);
  });

  it("scopes the daily series to an explicit date range", async () => {
    await seedSpend({ workspaceId, aiAgentId, agentModel: "m", createdAt: daysAgo(0) });
    await seedSpend({ workspaceId, aiAgentId, agentModel: "m", createdAt: daysAgo(10) });

    const from = daysAgo(0).toISOString().slice(0, 10);
    const summary = await withWorkspaceContext(workspaceId, () =>
      services.getAiUsageSummary({ from, to: from }),
    );

    expect(summary.daily).toHaveLength(1);
    expect(summary.daily[0]).toMatchObject({ creditsSpent: 1, turnCount: 1 });
  });

  it("never counts another Workspace's Credits toward the balance", async () => {
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId, type: "TRIAL_GRANT", credits: 500 },
    });
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId: otherWorkspaceId, type: "TRIAL_GRANT", credits: 500 },
    });
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId: otherWorkspaceId, type: "TOP_UP", credits: 9000 },
    });

    const summary = await withWorkspaceContext(workspaceId, () => services.getAiUsageSummary());

    expect(summary.balance).toBe(500);
  });
});

describe("listCreditLedger", () => {
  it("pages newest-first and never returns Model Rate or provider cost", async () => {
    await prisma.creditLedgerEntry.create({
      data: {
        id: randomUUID(),
        workspaceId,
        type: "TRIAL_GRANT",
        credits: 500,
        createdAt: daysAgo(2),
      },
    });
    await prisma.creditLedgerEntry.create({
      data: {
        id: randomUUID(),
        workspaceId,
        type: "SPEND",
        credits: -1,
        aiAgentId,
        agentModel: "openai/gpt-5.6-luna",
        modelRate: 1,
        providerCostUsd: 0.002,
        createdAt: daysAgo(1),
      },
    });
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId, type: "TOP_UP", credits: 100, createdAt: daysAgo(0) },
    });
    await prisma.creditLedgerEntry.create({
      data: { id: randomUUID(), workspaceId: otherWorkspaceId, type: "TRIAL_GRANT", credits: 500 },
    });

    const firstPage = await withWorkspaceContext(workspaceId, () =>
      services.listCreditLedger({ limit: 2 }),
    );

    expect(firstPage.entries).toHaveLength(2);
    expect(firstPage.entries[0].type).toBe("TOP_UP");
    expect(firstPage.entries.some((entry) => "modelRate" in entry)).toBe(false);
    expect(firstPage.entries.some((entry) => "providerCostUsd" in entry)).toBe(false);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await withWorkspaceContext(workspaceId, () =>
      services.listCreditLedger({ limit: 2, cursor: firstPage.nextCursor ?? undefined }),
    );

    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.entries[0].type).toBe("TRIAL_GRANT");
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects an unknown cursor", async () => {
    await expect(
      withWorkspaceContext(workspaceId, () => services.listCreditLedger({ cursor: "no-such-id" })),
    ).rejects.toBeInstanceOf(services.InvalidLedgerCursorError);
  });
});
