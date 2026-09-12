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

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("./prisma"));
  ({ processAutoResolveJob, processIdleClosureJob } = await import("./follow-up"));
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
