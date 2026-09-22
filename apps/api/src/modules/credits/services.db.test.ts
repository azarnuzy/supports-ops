import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Proof that the balance is nothing but the ledger sum, and that a Ticket's
 * deletion never changes it: `ticketId` on a spend entry is a plain column,
 * not a relation, so there is nothing for the delete to cascade into.
 */
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
  workspaceId = randomUUID();
  slug = `demo-${workspaceId.slice(0, 8)}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: "Demo", slug } });
});

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
    await prisma.$transaction((tx) => services.grantTrialCredits(tx, workspaceId));
    expect(await services.creditBalance(workspaceId)).toBe(services.trialGrantCredits);

    await services.topUpBySlug(slug, 100, "manual payment");
    expect(await services.creditBalance(workspaceId)).toBe(services.trialGrantCredits + 100);
  });

  it("survives the deletion of a Ticket a spend entry referenced", async () => {
    const ticketId = await seedTicket();
    await prisma.creditLedgerEntry.create({
      data: { credits: -1, id: randomUUID(), ticketId, type: "SPEND", workspaceId },
    });
    const balanceBefore = await services.creditBalance(workspaceId);

    await prisma.ticket.delete({ where: { id: ticketId } });

    expect(await services.creditBalance(workspaceId)).toBe(balanceBefore);
    expect(await prisma.creditLedgerEntry.count({ where: { workspaceId } })).toBe(1);
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
