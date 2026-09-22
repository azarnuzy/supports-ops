import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proof of ADR-0021's spend rule at the seam that actually decides it: a Turn
 * that finishes with a decision (reply, escalate, resolve) spends the Model
 * Rate; a Turn aborted by Takeover or failed by a provider error spends
 * nothing. `runAiAgentTurn` itself is faked — its own decision-routing is
 * covered in `packages/ai-agent`— so each case drives the Runtime exactly the
 * way `runAiAgentTurn` would for that outcome.
 */
const mocks = vi.hoisted(() => ({
  runAiAgentTurn: vi.fn(),
}));

vi.mock("@repo/ai-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ai-agent")>();
  return { ...actual, runAiAgentTurn: mocks.runAiAgentTurn };
});

vi.mock("../widget/realtime", () => ({
  isTicketGenerating: () => false,
  publishTicketQueueEvent: vi.fn(async () => undefined),
  publishWidgetEvent: vi.fn(async () => undefined),
  setTicketGenerating: vi.fn(),
}));

vi.mock("../follow-up/queue", () => ({
  cancelFollowUpTimers: vi.fn(async () => undefined),
  scheduleFollowUp: vi.fn(async () => undefined),
  scheduleIdleClosureForTicket: vi.fn(async () => undefined),
}));

vi.mock("../tickets/queue", () => ({ enqueueTicketKnowledgeIndex: vi.fn(async () => undefined) }));

vi.mock("../credits/alerts-queue", () => ({
  enqueueCreditAlertEmail: vi.fn(async () => undefined),
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let turn: typeof import("./turn");
let ids: { aiAgentId: string; sessionId: string; ticketId: string; workspaceId: string };

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  turn = await import("./turn");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  mocks.runAiAgentTurn.mockReset();
  ids = await seed();
});

async function seed() {
  const workspaceId = randomUUID();
  await prisma.workspace.create({
    data: { id: workspaceId, name: "Demo", slug: `demo-${workspaceId.slice(0, 8)}` },
  });
  await prisma.creditLedgerEntry.create({
    data: { credits: 500, id: randomUUID(), type: "TRIAL_GRANT", workspaceId },
  });
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
    data: { channelId, customerIdentityId, id: sessionId, messageSeq: 1, workspaceId },
  });
  await prisma.conversation.create({
    data: {
      id: randomUUID(),
      metadata: {},
      scopeKey: `session:${sessionId}`,
      sessionId,
      userId: customerIdentityId,
      workspaceId,
    },
  });
  const ticketId = randomUUID();
  await prisma.ticket.create({
    data: {
      aiAgentId,
      channelId,
      customerIdentityId,
      id: ticketId,
      sessionId,
      status: "AI_HANDLING",
      title: "Help",
      workspaceId,
    },
  });
  return { aiAgentId, sessionId, ticketId, workspaceId };
}

/** Excludes the Trial Grant `seed()` gives every Workspace so existing
 * assertions still read as "did this Turn spend?". */
function ledgerEntries() {
  return prisma.creditLedgerEntry.findMany({
    where: { type: { not: "TRIAL_GRANT" }, workspaceId: ids.workspaceId },
  });
}

describe("generateAiReply spend", () => {
  it("spends the Model Rate when the Turn replies", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ onResult, runtime }) => {
      await runtime.loadTicket();
      await onResult({
        usage: { cachedInputTokens: 30, inputTokens: 120, outputTokens: 15 },
      });
      await runtime.reply("REPLY", "Here's the answer.", randomUUID());
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Help me");

    expect(await ledgerEntries()).toEqual([
      expect.objectContaining({
        agentModel: "openai/gpt-5.6-luna",
        aiAgentId: ids.aiAgentId,
        cachedInputTokens: 30,
        channel: "WEB",
        credits: -1,
        inputTokens: 120,
        outputTokens: 15,
        modelRate: 1,
        sessionId: ids.sessionId,
        ticketId: ids.ticketId,
        type: "SPEND",
      }),
    ]);
  });

  it("spends the Model Rate when the Turn resolves", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ runtime }) => {
      await runtime.loadTicket();
      await runtime.resolve("Glad that's sorted.");
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "That fixed it, thanks!");

    expect(await ledgerEntries()).toHaveLength(1);
  });

  it("spends the Model Rate when the Turn escalates with a business reason", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ runtime }) => {
      await runtime.loadTicket();
      await runtime.escalate("NO_RELEVANT_KNOWLEDGE");
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Where is my invoice?");

    expect(await ledgerEntries()).toHaveLength(1);
  });

  it("spends nothing when a provider error escalates the Turn", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ runtime }) => {
      await runtime.loadTicket();
      await runtime.escalate("AI_GENERATION_FAILED");
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Help me");

    expect(await ledgerEntries()).toHaveLength(0);
  });

  it("spends nothing when the Turn times out", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ runtime }) => {
      await runtime.loadTicket();
      await runtime.escalate("AI_TIMEOUT");
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Help me");

    expect(await ledgerEntries()).toHaveLength(0);
  });

  it("escalates with CREDIT_EXHAUSTION and never calls the model when the balance is zero or below", async () => {
    await prisma.creditLedgerEntry.create({
      data: { credits: -500, id: randomUUID(), type: "SPEND", workspaceId: ids.workspaceId },
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Help me");

    expect(mocks.runAiAgentTurn).not.toHaveBeenCalled();
    expect(await ledgerEntries()).toHaveLength(1);
    const ticket = await prisma.ticket.findUniqueOrThrow({
      select: { escalationReason: true, status: true },
      where: { id: ids.ticketId },
    });
    expect(ticket).toMatchObject({ escalationReason: "CREDIT_EXHAUSTION", status: "ESCALATED" });
  });

  it("spends nothing when Takeover aborts the Turn before it replies", async () => {
    mocks.runAiAgentTurn.mockImplementation(async ({ runtime }) => {
      await runtime.loadTicket();
      // A Takeover racing the in-flight Turn: the Ticket leaves AI_HANDLING
      // before the reply lands, exactly as `takeOverTicket` does.
      await prisma.ticket.update({
        data: { status: "HUMAN_HANDLING" },
        where: { id: ids.ticketId },
      });
      await runtime.reply("REPLY", "Here's the answer.", randomUUID());
      await runtime.finish();
    });

    await turn.generateAiReply(ids.ticketId, ids.workspaceId, "Help me");

    expect(await ledgerEntries()).toHaveLength(0);
  });
});
