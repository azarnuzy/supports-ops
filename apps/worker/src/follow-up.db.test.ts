import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ioredis", () => ({
  default: class {
    publish = vi.fn(async () => 1);
  },
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = vi.fn(async () => undefined);
    remove = vi.fn(async () => undefined);
  },
}));

let database: TestDatabase;
let prisma: typeof import("./prisma").prisma;
let processIdleClosureJob: typeof import("./follow-up").processIdleClosureJob;
let processAutoResolveJob: typeof import("./follow-up").processAutoResolveJob;
let processFollowUpJob: typeof import("./follow-up").processFollowUpJob;
let processSessionFollowUpJob: typeof import("./follow-up").processSessionFollowUpJob;
let processSessionAutoResolveJob: typeof import("./follow-up").processSessionAutoResolveJob;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("./prisma"));
  ({ processAutoResolveJob, processFollowUpJob, processIdleClosureJob } = await import(
    "./follow-up"
  ));
  ({ processSessionFollowUpJob, processSessionAutoResolveJob } = await import("./follow-up"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

async function seedTicket(status: "ESCALATED" | "HUMAN_HANDLING", channelType: "WEB" | "WHATSAPP") {
  const suffix = randomUUID();
  const workspaceId = `workspace-${suffix}`;
  const aiAgentId = `ai-${suffix}`;
  const channelId = `channel-${suffix}`;
  const customerIdentityId = `customer-${suffix}`;
  const sessionId = `session-${suffix}`;
  const ticketId = `ticket-${suffix}`;
  const humanAgentId = status === "HUMAN_HANDLING" ? `human-${suffix}` : null;
  const customerLastMessageAt = new Date(Date.now() - 9 * 60 * 60 * 1_000);

  await prisma.workspace.create({
    data: {
      closingMessage: "We’re closing this Ticket for now.",
      id: workspaceId,
      name: "Demo",
      slug: suffix,
    },
  });
  await prisma.aiSettings.create({
    data: { id: `settings-${suffix}`, idleCloseAfterSeconds: 28_800, workspaceId },
  });
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
  await prisma.channel.create({
    data: { aiAgentId, id: channelId, name: channelType, type: channelType, workspaceId },
  });
  await prisma.customerIdentity.create({
    data: {
      canonicalId: `${suffix}@example.com`,
      channelType,
      email: `${suffix}@example.com`,
      id: customerIdentityId,
      name: "Customer",
      workspaceId,
    },
  });
  if (humanAgentId) {
    await prisma.user.create({
      data: {
        email: `${humanAgentId}@example.com`,
        emailVerified: true,
        id: humanAgentId,
        name: "Human Agent",
        role: "HUMAN_AGENT",
        workspaceId,
      },
    });
  }
  await prisma.session.create({
    data: {
      channelId,
      conversation: {
        create: {
          id: `memory-${suffix}`,
          metadata: {},
          scopeKey: `session:${sessionId}`,
          userId: customerIdentityId,
          workspaceId,
        },
      },
      customerIdentityId,
      customerLastMessageAt,
      id: sessionId,
      workspaceId,
    },
  });
  await prisma.ticket.create({
    data: {
      aiAgentId,
      assignedHumanAgentId: humanAgentId,
      channelId,
      customerIdentityId,
      escalatedAt: customerLastMessageAt,
      id: ticketId,
      sessionId,
      status,
      title: "Need help",
      workspaceId,
    },
  });

  return {
    assignedHumanAgentId: humanAgentId,
    customerLastMessageAt,
    sessionId,
    status,
    ticketId,
    workspaceId,
  };
}

function jobFor(ticket: Awaited<ReturnType<typeof seedTicket>>) {
  return {
    data: {
      assignedHumanAgentId: ticket.assignedHumanAgentId,
      customerLastMessageAt: ticket.customerLastMessageAt.toISOString(),
      status: ticket.status,
      ticketId: ticket.ticketId,
      workspaceId: ticket.workspaceId,
    },
  };
}

describe("Session Follow-Up without a Ticket", () => {
  it("sends a free Follow-Up and closes only the Session after silence", async () => {
    const seeded = await seedTicket("ESCALATED", "WEB");
    await prisma.ticket.delete({ where: { id: seeded.ticketId } });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { sessionId: seeded.sessionId },
    });
    const aiMessageId = randomUUID();
    await prisma.message.create({
      data: {
        content: "Hi!",
        externalMessageId: aiMessageId,
        id: aiMessageId,
        memorySessionId: conversation.id,
        message: { content: "Hi!" },
        position: 1,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        sessionId: seeded.sessionId,
        turn: 1,
        workspaceId: seeded.workspaceId,
      },
    });
    await prisma.session.update({ data: { messageSeq: 1 }, where: { id: seeded.sessionId } });

    await processSessionFollowUpJob({
      data: { aiMessageId, sessionId: seeded.sessionId, workspaceId: seeded.workspaceId },
    });
    const followUp = await prisma.message.findFirstOrThrow({
      orderBy: { position: "desc" },
      where: { sessionId: seeded.sessionId },
    });
    expect(followUp.content).toContain("still like help");
    expect(await prisma.creditLedgerEntry.count()).toBe(0);
    await processSessionAutoResolveJob({
      data: {
        followUpMessageId: followUp.id,
        sessionId: seeded.sessionId,
        workspaceId: seeded.workspaceId,
      },
    });
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: seeded.sessionId } })).status,
    ).toBe("CLOSED");
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe("Idle Closure worker", () => {
  it.each([
    ["HUMAN_HANDLING", "WEB", "CUSTOMER_INACTIVE_HUMAN_HANDLING"],
    ["ESCALATED", "WHATSAPP", "CUSTOMER_INACTIVE_SHARED_QUEUE"],
  ] as const)(
    "closes a %s Ticket on %s with its distinct reason",
    async (status, channel, reason) => {
      const seeded = await seedTicket(status, channel);

      await processIdleClosureJob(jobFor(seeded));

      const ticket = await prisma.ticket.findUniqueOrThrow({
        include: { messages: true, session: true },
        where: { id: seeded.ticketId },
      });
      expect(ticket).toMatchObject({
        resolutionReason: reason,
        resolvedBy: "PLATFORM",
        status: "RESOLVED",
        session: { status: "CLOSED" },
      });
      expect(ticket.messages).toEqual([
        expect.objectContaining({
          content: "We’re closing this Ticket for now.",
          senderType: "SYSTEM",
        }),
      ]);
    },
  );

  it("lets a Customer message beat a stale due timer", async () => {
    const seeded = await seedTicket("ESCALATED", "WEB");
    await prisma.session.update({
      data: { customerLastMessageAt: new Date() },
      where: { id: seeded.sessionId },
    });

    await processIdleClosureJob(jobFor(seeded));

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: seeded.ticketId } })).toMatchObject(
      {
        resolutionReason: null,
        status: "ESCALATED",
      },
    );
  });

  it("lets a Claim beat a stale due timer", async () => {
    const seeded = await seedTicket("ESCALATED", "WEB");
    const ownerId = `owner-${randomUUID()}`;
    await prisma.user.create({
      data: {
        email: `${ownerId}@example.com`,
        emailVerified: true,
        id: ownerId,
        name: "Human Agent",
        role: "HUMAN_AGENT",
        workspaceId: seeded.workspaceId,
      },
    });
    await prisma.ticket.update({
      data: { assignedHumanAgentId: ownerId, status: "HUMAN_HANDLING" },
      where: { id: seeded.ticketId },
    });

    await processIdleClosureJob(jobFor(seeded));

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: seeded.ticketId } })).toMatchObject(
      {
        resolutionReason: null,
        status: "HUMAN_HANDLING",
      },
    );
  });

  it("lets a Takeover beat a due AI timer", async () => {
    const seeded = await seedTicket("ESCALATED", "WEB");
    const memory = await prisma.conversation.findUniqueOrThrow({
      where: { sessionId: seeded.sessionId },
    });
    const followUpMessageId = randomUUID();
    await prisma.session.update({ data: { messageSeq: 1 }, where: { id: seeded.sessionId } });
    await prisma.message.create({
      data: {
        content: "Did that resolve it?",
        externalMessageId: `follow-up:${seeded.ticketId}`,
        id: followUpMessageId,
        memorySessionId: memory.id,
        message: { content: "Did that resolve it?" },
        position: 1,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        sessionId: seeded.sessionId,
        ticketId: seeded.ticketId,
        turn: 1,
        workspaceId: seeded.workspaceId,
      },
    });
    await prisma.ticket.update({
      data: { status: "AI_HANDLING" },
      where: { id: seeded.ticketId },
    });
    const adminId = `admin-${randomUUID()}`;
    await prisma.user.create({
      data: {
        email: `${adminId}@example.com`,
        emailVerified: true,
        id: adminId,
        name: "Admin",
        role: "ADMIN",
        workspaceId: seeded.workspaceId,
      },
    });
    await prisma.ticket.update({
      data: { assignedHumanAgentId: adminId, status: "HUMAN_HANDLING" },
      where: { id: seeded.ticketId },
    });

    await processAutoResolveJob({
      data: { followUpMessageId, ticketId: seeded.ticketId, workspaceId: seeded.workspaceId },
    });

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: seeded.ticketId } })).toMatchObject(
      {
        resolutionReason: null,
        status: "HUMAN_HANDLING",
      },
    );
  });
});

describe("Follow-Up worker", () => {
  async function seedAiHandlingTicket() {
    const suffix = randomUUID();
    const workspaceId = `workspace-${suffix}`;
    const aiAgentId = `ai-${suffix}`;
    const channelId = `channel-${suffix}`;
    const customerIdentityId = `customer-${suffix}`;
    const sessionId = `session-${suffix}`;
    const ticketId = `ticket-${suffix}`;
    const memoryId = `memory-${suffix}`;
    const aiMessageId = `message-${suffix}`;

    await prisma.workspace.create({
      data: { id: workspaceId, name: "Demo", slug: suffix },
    });
    await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
    await prisma.channel.create({
      data: { aiAgentId, id: channelId, name: "WEB", type: "WEB", workspaceId },
    });
    await prisma.customerIdentity.create({
      data: {
        canonicalId: `${suffix}@example.com`,
        channelType: "WEB",
        email: `${suffix}@example.com`,
        id: customerIdentityId,
        name: "Customer",
        workspaceId,
      },
    });
    await prisma.session.create({
      data: {
        channelId,
        conversation: {
          create: {
            id: memoryId,
            metadata: {},
            scopeKey: `session:${sessionId}`,
            userId: customerIdentityId,
            workspaceId,
          },
        },
        customerIdentityId,
        id: sessionId,
        messageSeq: 1,
        workspaceId,
      },
    });
    await prisma.ticket.create({
      data: {
        aiAgentId,
        channelId,
        customerIdentityId,
        id: ticketId,
        sessionId,
        status: "AI_HANDLING",
        title: "Need help",
        workspaceId,
      },
    });
    await prisma.message.create({
      data: {
        content: "Here's the answer.",
        externalMessageId: `ai:${suffix}`,
        id: aiMessageId,
        memorySessionId: memoryId,
        message: { content: "Here's the answer." },
        position: 1,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        sessionId,
        ticketId,
        turn: 1,
        workspaceId,
      },
    });

    return { aiAgentId, aiMessageId, ticketId, workspaceId };
  }

  it("spends a Credit at the Agent Model's Model Rate", async () => {
    const seeded = await seedAiHandlingTicket();

    await processFollowUpJob({
      data: {
        aiMessageId: seeded.aiMessageId,
        ticketId: seeded.ticketId,
        workspaceId: seeded.workspaceId,
      },
    });

    const entries = await prisma.creditLedgerEntry.findMany({
      where: { workspaceId: seeded.workspaceId },
    });
    expect(entries).toEqual([
      expect.objectContaining({
        agentModel: "openai/gpt-5.6-luna",
        aiAgentId: seeded.aiAgentId,
        credits: -1,
        modelRate: 1,
        ticketId: seeded.ticketId,
        type: "SPEND",
      }),
    ]);
  });

  it("spends nothing when a newer message already beat the timer", async () => {
    const seeded = await seedAiHandlingTicket();
    await prisma.ticket.update({ data: { status: "RESOLVED" }, where: { id: seeded.ticketId } });

    await processFollowUpJob({
      data: {
        aiMessageId: seeded.aiMessageId,
        ticketId: seeded.ticketId,
        workspaceId: seeded.workspaceId,
      },
    });

    const count = await prisma.creditLedgerEntry.count({
      where: { workspaceId: seeded.workspaceId },
    });
    expect(count).toBe(0);
  });
});
