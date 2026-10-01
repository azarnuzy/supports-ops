import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proof that the balance is nothing but the ledger sum, and that a Ticket's
 * deletion never changes it: `ticketId` on a spend entry is a plain column,
 * not a relation, so there is nothing for the delete to cascade into.
 */
const mocks = vi.hoisted(() => ({ enqueueCreditAlertEmail: vi.fn(async () => undefined) }));

vi.mock("./alerts-queue", () => ({ enqueueCreditAlertEmail: mocks.enqueueCreditAlertEmail }));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");
let workspaceId: string;
let slug: string;

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
  mocks.enqueueCreditAlertEmail.mockClear();
  workspaceId = randomUUID();
  slug = `demo-${workspaceId.slice(0, 8)}`;
  await prisma.organization.create({ data: { id: workspaceId, name: "Demo" } });
  await prisma.workspace.create({
    data: { id: workspaceId, organizationId: workspaceId, name: "Demo", slug },
  });
});

/** The only catalog Model Rate is 1 Credit per Turn, so each call spends exactly 1. */
async function spendOnce(fromWorkspaceId = workspaceId) {
  await prisma.$transaction((tx) =>
    services.spendForTurn(tx, {
      agentModel: null,
      aiAgentId: randomUUID(),
      sessionId: randomUUID(),
      ticketId: randomUUID(),
      workspaceId: fromWorkspaceId,
    }),
  );
}

async function grantBalance(credits: number) {
  await prisma.creditLedgerEntry.create({
    data: { credits, id: randomUUID(), type: "TOP_UP", organizationId: workspaceId, workspaceId },
  });
}

async function seedTicket() {
  const aiAgentId = randomUUID();
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "Agent", workspaceId } });
  const channelId = randomUUID();
  await prisma.channel.create({
    data: { aiAgentId, id: channelId, name: "Web", type: "WEB", workspaceId },
  });
  const customerIdentityId = randomUUID();
  await prisma.customerIdentity.create({
    data: {
      canonicalId: "a@b.test",
      channelType: "WEB",
      email: "a@b.test",
      id: customerIdentityId,
      name: "A",
      workspaceId,
    },
  });
  const sessionId = randomUUID();
  await prisma.session.create({
    data: { channelId, customerIdentityId, id: sessionId, workspaceId },
  });
  const ticketId = randomUUID();
  await prisma.ticket.create({
    data: {
      aiAgentId,
      channelId,
      customerIdentityId,
      id: ticketId,
      sessionId,
      title: "Help",
      workspaceId,
    },
  });
  return ticketId;
}

describe("credit balance", () => {
  it("is the sum of the ledger, across Trial Grant and Top-Up", async () => {
    await prisma.$transaction((tx) => services.grantTrialCredits(tx, workspaceId, workspaceId));
    expect(await services.creditBalance(workspaceId)).toBe(services.trialGrantCredits);

    await services.topUpBySlug(slug, 100, "manual payment");
    expect(await services.creditBalance(workspaceId)).toBe(services.trialGrantCredits + 100);
  });

  it("survives the deletion of a Ticket a spend entry referenced", async () => {
    const ticketId = await seedTicket();
    await prisma.creditLedgerEntry.create({
      data: {
        credits: -1,
        id: randomUUID(),
        ticketId,
        type: "SPEND",
        organizationId: workspaceId,
        workspaceId,
      },
    });
    const balanceBefore = await services.creditBalance(workspaceId);

    await prisma.ticket.delete({ where: { id: ticketId } });

    expect(await services.creditBalance(workspaceId)).toBe(balanceBefore);
    expect(await prisma.creditLedgerEntry.count({ where: { workspaceId } })).toBe(1);
  });

  it("shares one Organization balance while keeping spend attributed to its Workspace", async () => {
    const secondWorkspaceId = randomUUID();
    await prisma.workspace.create({
      data: {
        id: secondWorkspaceId,
        organizationId: workspaceId,
        name: "Second",
        slug: secondWorkspaceId,
      },
    });
    await prisma.$transaction((tx) => services.grantTrialCredits(tx, workspaceId, workspaceId));
    await services.recordTopUp(prisma, secondWorkspaceId, 25, "payment");
    await prisma.$transaction((tx) =>
      services.spendForTurn(tx, {
        aiAgentId: randomUUID(),
        agentModel: null,
        sessionId: randomUUID(),
        ticketId: randomUUID(),
        workspaceId: secondWorkspaceId,
      }),
    );

    expect(await services.creditBalance(workspaceId)).toBe(524);
    expect(await services.creditBalance(secondWorkspaceId)).toBe(524);
    expect(
      await prisma.creditLedgerEntry.findMany({
        where: { organizationId: workspaceId, type: "SPEND" },
        select: { workspaceId: true },
      }),
    ).toEqual([{ workspaceId: secondWorkspaceId }]);
  });
});

describe("spendForTurn balance-crossing emails", () => {
  it("alerts once across Workspaces and keeps another Organization separate", async () => {
    const secondWorkspaceId = randomUUID();
    const otherOrganizationId = randomUUID();
    await prisma.workspace.create({
      data: {
        id: secondWorkspaceId,
        organizationId: workspaceId,
        name: "Second",
        slug: secondWorkspaceId,
      },
    });
    await prisma.organization.create({ data: { id: otherOrganizationId, name: "Other" } });
    await prisma.workspace.create({
      data: {
        id: otherOrganizationId,
        organizationId: otherOrganizationId,
        name: "Other",
        slug: otherOrganizationId,
      },
    });
    await grantBalance(100);
    await prisma.creditLedgerEntry.create({
      data: {
        credits: 100,
        id: randomUUID(),
        type: "TOP_UP",
        organizationId: otherOrganizationId,
        workspaceId: otherOrganizationId,
      },
    });

    await Promise.all([spendOnce(secondWorkspaceId), spendOnce()]);

    expect(await services.creditBalance(workspaceId)).toBe(98);
    expect(await services.creditBalance(secondWorkspaceId)).toBe(98);
    expect(await services.creditBalance(otherOrganizationId)).toBe(100);
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledExactlyOnceWith({
      kind: "LOW_BALANCE",
      organizationId: workspaceId,
      workspaceId: expect.stringMatching(new RegExp(`^(${workspaceId}|${secondWorkspaceId})$`)),
    });
  });

  it("emails once when a spend crosses below the low-balance threshold", async () => {
    await grantBalance(100);

    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledExactlyOnceWith({
      kind: "LOW_BALANCE",
      organizationId: workspaceId,
      workspaceId,
    });

    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledOnce();
  });

  it("emails once when a spend crosses to Credit Exhaustion, not the low-balance email", async () => {
    await grantBalance(1);

    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledExactlyOnceWith({
      kind: "CREDIT_EXHAUSTED",
      organizationId: workspaceId,
      workspaceId,
    });
  });

  it("emails again after a Top-Up lifts the balance back over the threshold and it dips again", async () => {
    await grantBalance(100);
    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledOnce();

    await services.topUpBySlug(slug, 5, "top-up");
    await spendOnce();
    await spendOnce();
    await spendOnce();
    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledOnce();

    await spendOnce();
    expect(mocks.enqueueCreditAlertEmail).toHaveBeenCalledTimes(2);
  });
});

describe("spendForTurn during an Unlimited Period", () => {
  async function grantUnlimitedPeriod(endAt: Date) {
    await prisma.operator.create({
      data: { id: randomUUID(), name: "Op", email: `${randomUUID()}@example.com` },
    });
    const operatorId = (await prisma.operator.findFirstOrThrow()).id;
    await prisma.unlimitedPeriod.create({
      data: { id: randomUUID(), organizationId: workspaceId, operatorId, endAt },
    });
  }

  it("spends 0 Credits and leaves the balance untouched, even at zero balance", async () => {
    await grantUnlimitedPeriod(new Date(Date.now() + 60_000));
    const balanceBefore = await services.creditBalance(workspaceId);

    await spendOnce();

    expect(await services.creditBalance(workspaceId)).toBe(balanceBefore);
    const entry = await prisma.creditLedgerEntry.findFirstOrThrow({ where: { workspaceId } });
    expect(entry.credits).toBe(0);
    expect(entry.modelRate).toBe(1);
    expect(mocks.enqueueCreditAlertEmail).not.toHaveBeenCalled();
  });

  it("waives spend in existing and newly created Workspaces of the Organization", async () => {
    const secondId = randomUUID();
    await prisma.workspace.create({
      data: { id: secondId, organizationId: workspaceId, name: "Second", slug: secondId },
    });
    await grantUnlimitedPeriod(new Date(Date.now() + 60_000));
    await spendOnce();
    await spendOnce(secondId);
    const thirdId = randomUUID();
    await prisma.workspace.create({
      data: { id: thirdId, organizationId: workspaceId, name: "Third", slug: thirdId },
    });
    await spendOnce(thirdId);
    const spends = await prisma.creditLedgerEntry.findMany({
      where: { type: "SPEND" },
      select: { credits: true, modelRate: true },
    });
    expect(spends).toHaveLength(3);
    expect(spends.every((entry) => entry.credits === 0 && entry.modelRate === 1)).toBe(true);
    expect(await services.creditBalance(workspaceId)).toBe(0);
    await prisma.unlimitedPeriod.updateMany({
      where: { organizationId: workspaceId },
      data: { endedEarlyAt: new Date() },
    });
    await grantBalance(3);
    await spendOnce(secondId);
    expect(await services.creditBalance(workspaceId)).toBe(2);
    expect(await prisma.creditLedgerEntry.count({ where: { type: "SPEND", credits: 0 } })).toBe(3);
  });

  it("still records Model Rate, Tokens, and provider cost", async () => {
    await grantUnlimitedPeriod(new Date(Date.now() + 60_000));
    await prisma.$transaction((tx) =>
      services.spendForTurn(tx, {
        agentModel: null,
        aiAgentId: randomUUID(),
        providerCostUsd: 0.05,
        sessionId: randomUUID(),
        ticketId: randomUUID(),
        usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3 },
        workspaceId,
      }),
    );
    const entry = await prisma.creditLedgerEntry.findFirstOrThrow({ where: { workspaceId } });
    expect(entry).toMatchObject({
      credits: 0,
      modelRate: 1,
      providerCostUsd: 0.05,
      inputTokens: 2,
      cachedInputTokens: 1,
      outputTokens: 3,
    });
  });

  it("spends Credits normally once the period has ended", async () => {
    await grantUnlimitedPeriod(new Date(Date.now() - 1000));
    await grantBalance(10);

    await spendOnce();

    expect(await services.creditBalance(workspaceId)).toBe(9);
  });

  it("spends Credits normally after an early end", async () => {
    await grantUnlimitedPeriod(new Date(Date.now() + 60_000));
    await grantBalance(10);
    await prisma.unlimitedPeriod.updateMany({
      where: { organizationId: workspaceId },
      data: { endedEarlyAt: new Date() },
    });

    await spendOnce();

    expect(await services.creditBalance(workspaceId)).toBe(9);
  });
});

describe("topUpBySlug", () => {
  it("rejects an unknown slug", async () => {
    await expect(services.topUpBySlug("no-such-workspace", 100, "note")).rejects.toBeInstanceOf(
      services.WorkspaceNotFoundError,
    );
  });

  it("rejects a non-positive amount", async () => {
    await expect(services.topUpBySlug(slug, 0, "note")).rejects.toBeInstanceOf(
      services.InvalidTopUpAmountError,
    );
    await expect(services.topUpBySlug(slug, -5, "note")).rejects.toBeInstanceOf(
      services.InvalidTopUpAmountError,
    );
  });
});
