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
export const fixtureCustomerMessage = "I can't log into my account anymore, can someone help?";

async function deleteExistingFixture(workspaceId: string) {
  const existing = await prisma.ticket.findFirst({
    where: { title: fixtureTitle, workspaceId },
  });
  if (!existing) return;

  await prisma.aiActivity.deleteMany({ where: { ticketId: existing.id } });
  await prisma.message.deleteMany({ where: { ticketId: existing.id } });
  await prisma.conversation.deleteMany({ where: { ticketId: existing.id } });
  await prisma.ticket.delete({ where: { id: existing.id } });
  await prisma.webSession.delete({ where: { id: existing.webSessionId } });
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
      channelType: "WEB",
      email: `e2e-fixture-${randomUUID()}@example.com`,
      id: randomUUID(),
      name: fixtureCustomerName,
      workspaceId: admin.workspaceId,
    },
  });

  const webSession = await prisma.webSession.create({
    data: {
      accessToken: randomUUID(),
      channelId: channel.id,
      customerIdentityId: customerIdentity.id,
      id: randomUUID(),
      status: "ACTIVE",
      workspaceId: admin.workspaceId,
    },
  });

  const ticketId = randomUUID();
  const conversationId = randomUUID();

  await prisma.ticket.create({
    data: {
      assignedHumanAgentId: agent.id,
      category: "ACCOUNT",
      channelId: channel.id,
      customerIdentityId: customerIdentity.id,
      escalatedAt: new Date(),
      escalationReason: "CUSTOMER_REQUESTED_HUMAN",
      escalationSummary: "Customer is locked out of their account and requested a Human Agent.",
      escalationSummaryStatus: "READY",
      id: ticketId,
      messageSeq: 2,
      priority: "HIGH",
      status: "HUMAN_HANDLING",
      title: fixtureTitle,
      webSessionId: webSession.id,
      workspaceId: admin.workspaceId,
    },
  });

  await prisma.conversation.create({
    data: {
      id: conversationId,
      metadata: {},
      scopeKey: `ticket:${ticketId}`,
      sessionId: webSession.id,
      ticketId,
      userId: customerIdentity.id,
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
