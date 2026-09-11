import { randomUUID } from "node:crypto";
import { unscopedPrisma as prisma } from "../apps/api/src/utils/prisma";

/**
 * Seeds one deterministic HUMAN_HANDLING Ticket, owned by the demo Human
 * Agent from scripts/seed-demo.ts, so the Platform browser-level tests have
 * a stable Mine fixture to select and act on. Idempotent: re-running it
 * replaces the previous fixture rather than accumulating rows.
 */

const demoAdminEmail = "admin@demo.supportops.dev";
const demoHumanAgentEmail = "agent@demo.supportops.dev";
const fixtureTitle = "E2E Mine Ticket Fixture";
export const fixtureCustomerName = "E2E Fixture Customer";
const fixtureEmail = `e2e-fixture-${randomUUID()}@example.com`;
export const fixtureCustomerMessage = "I can't log into my account anymore, can someone help?";

async function deleteExistingFixture(workspaceId: string) {
  const existing = await prisma.ticket.findFirst({
    where: { title: fixtureTitle, workspaceId },
  });
  if (!existing) return;

  await prisma.aiActivity.deleteMany({ where: { ticketId: existing.id } });
  await prisma.message.deleteMany({ where: { ticketId: existing.id } });
  await prisma.ticket.delete({ where: { id: existing.id } });
  await prisma.conversation.deleteMany({ where: { sessionId: existing.sessionId } });
  await prisma.session.delete({ where: { id: existing.sessionId } });
  await prisma.customerIdentity.delete({ where: { id: existing.customerIdentityId } });
}

export async function seedMineTicketFixture() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: demoAdminEmail } });
  const agent = await prisma.user.findUniqueOrThrow({ where: { email: demoHumanAgentEmail } });
  const channel = await prisma.channel.findFirstOrThrow({
    where: { type: "WEB", workspaceId: admin.workspaceId },
  });

  await deleteExistingFixture(admin.workspaceId);

  const customerIdentity = await prisma.customerIdentity.create({
    data: {
      canonicalId: fixtureEmail,
      channelType: "WEB",
      email: fixtureEmail,
      id: randomUUID(),
      name: fixtureCustomerName,
      workspaceId: admin.workspaceId,
    },
  });

  const sessionId = randomUUID();
  await prisma.session.create({
    data: {
      accessToken: randomUUID(),
      channelId: channel.id,
      customerIdentityId: customerIdentity.id,
      id: sessionId,
      messageSeq: 2,
      status: "ACTIVE",
      workspaceId: admin.workspaceId,
    },
  });

  const ticketId = randomUUID();
  const conversationId = randomUUID();

  await prisma.conversation.create({
    data: {
      id: conversationId,
      metadata: {},
      scopeKey: `session:${sessionId}`,
      sessionId,
      userId: customerIdentity.id,
      workspaceId: admin.workspaceId,
    },
  });

  await prisma.ticket.create({
    data: {
      aiAgentId: channel.aiAgentId,
      assignedHumanAgentId: agent.id,
      category: "ACCOUNT",
      channelId: channel.id,
      customerIdentityId: customerIdentity.id,
      escalatedAt: new Date(),
      escalationReason: "CUSTOMER_REQUESTED_HUMAN",
      escalationSummary: "Customer is locked out of their account and requested a Human Agent.",
      escalationSummaryStatus: "READY",
      id: ticketId,
      priority: "HIGH",
      sessionId,
      status: "HUMAN_HANDLING",
      title: fixtureTitle,
      workspaceId: admin.workspaceId,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: fixtureCustomerMessage,
        deliveryStatus: "SENT",
        externalMessageId: randomUUID(),
        id: randomUUID(),
        memorySessionId: conversationId,
        message: {},
        position: 1,
        role: "user",
        runId: randomUUID(),
        senderType: "CUSTOMER",
        sessionId,
        ticketId,
        turn: 1,
        workspaceId: admin.workspaceId,
      },
      {
        content: "I'm connecting you with a Human Agent who can help with account access.",
        deliveryStatus: "SENT",
        externalMessageId: randomUUID(),
        id: randomUUID(),
        memorySessionId: conversationId,
        message: {},
        position: 2,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        sessionId,
        ticketId,
        turn: 1,
        workspaceId: admin.workspaceId,
      },
    ],
  });

  await prisma.aiActivity.createMany({
    data: [
      {
        eventType: "TICKET_CREATED",
        id: randomUUID(),
        metadata: {},
        ticketId,
        workspaceId: admin.workspaceId,
      },
      {
        eventType: "ESCALATED",
        id: randomUUID(),
        metadata: { reason: "CUSTOMER_REQUESTED_HUMAN" },
        ticketId,
        workspaceId: admin.workspaceId,
      },
      {
        eventType: "CLAIMED",
        id: randomUUID(),
        metadata: {},
        ticketId,
        workspaceId: admin.workspaceId,
      },
    ],
  });

  return { ticketId };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedMineTicketFixture()
    .then(({ ticketId }) => {
      console.log(`Seeded E2E Mine Ticket fixture: ${ticketId}`);
      return prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
