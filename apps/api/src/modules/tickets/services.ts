import { randomUUID } from "node:crypto";
import { createReplyModel, generateEscalationSummary } from "@repo/ai-agent";
import { aiAgentConfig } from "../../config";
import { prisma, unscopedPrisma } from "../../utils/prisma";
import { publishTicketQueueEvent, publishWidgetEvent } from "../widget/realtime";

const ticketSelect = {
  assignedHumanAgent: { select: { id: true, name: true } },
  customerIdentity: { select: { name: true } },
  id: true,
  priority: true,
  title: true,
  createdAt: true,
  escalatedAt: true,
  escalationSummary: true,
  escalationSummaryStatus: true,
} as const;

export class TicketAlreadyClaimedError extends Error {
  constructor() {
    super("This Ticket was just claimed by another Human Agent.");
  }
}

export class HumanAgentNotFoundError extends Error {}

export function listSharedHumanQueue() {
  return prisma.ticket.findMany({
    orderBy: { escalatedAt: "asc" },
    select: ticketSelect,
    where: { assignedHumanAgentId: null, status: "ESCALATED" },
  });
}

export function listMyTickets(humanAgentId: string) {
  return prisma.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    select: ticketSelect,
    where: { assignedHumanAgentId: humanAgentId, status: "HUMAN_HANDLING" },
  });
}

/** The status predicate is the concurrency guard: exactly one UPDATE can
 * transition an escalated, unassigned Ticket to a named Human Agent. */
export async function claimTicket(ticketId: string, humanAgentId: string, workspaceId: string) {
  const claimed = await prisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { assignedHumanAgentId: humanAgentId, status: "HUMAN_HANDLING" },
      where: { assignedHumanAgentId: null, id: ticketId, status: "ESCALATED" },
    });
    if (!transition.count) throw new TicketAlreadyClaimedError();
    await tx.aiActivity.create({
      data: { eventType: "CLAIMED", id: randomUUID(), metadata: { humanAgentId }, ticketId },
    });
    return tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: ticketSelect });
  });
  await publishTicketQueueEvent(workspaceId);
  return claimed;
}

/** Handoff deliberately happens after the conditional Claim transaction. A
 * summary failure must never take a Ticket away from its Human Agent. */
export async function completeHandoff(ticketId: string, humanAgentId: string, workspaceId: string) {
  const ticket = await unscopedPrisma.ticket.findFirst({
    select: {
      assignedHumanAgent: { select: { name: true } },
      escalationReason: true,
      id: true,
      messages: {
        orderBy: { position: "asc" },
        select: { content: true, senderType: true },
      },
      aiActivities: {
        orderBy: { createdAt: "asc" },
        select: { eventType: true, metadata: true },
      },
      status: true,
      title: true,
    },
    where: {
      assignedHumanAgentId: humanAgentId,
      id: ticketId,
      status: "HUMAN_HANDLING",
      workspaceId,
    },
  });
  if (!ticket?.assignedHumanAgent || !ticket.escalationReason) return;

  const handoffMessage = await appendHandoffMessage({
    humanAgentName: ticket.assignedHumanAgent.name,
    ticketId,
    workspaceId,
  });
  await publishWidgetEvent(ticketId, { type: "message.created", data: handoffMessage });

  try {
    if (!aiAgentConfig.apiKey) throw new Error("AI Agent is not configured.");
    const summary = await generateEscalationSummary({
      model: createReplyModel({ ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }),
      ticket: {
        escalationReason: ticket.escalationReason,
        messages: ticket.messages,
        recordedActivity: ticket.aiActivities
          .map((activity) => `${activity.eventType}: ${JSON.stringify(activity.metadata)}`)
          .join("\n"),
        title: ticket.title,
      },
    });
    await unscopedPrisma.$transaction(async (tx) => {
      await tx.ticket.update({
        data: { escalationSummary: summary, escalationSummaryStatus: "READY" },
        where: { id: ticketId },
      });
      await tx.aiActivity.create({
        data: {
          eventType: "SUMMARY_GENERATED",
          id: randomUUID(),
          metadata: { outcome: "SUCCESS" },
          ticketId,
          workspaceId,
        },
      });
    });
  } catch {
    await unscopedPrisma.$transaction(async (tx) => {
      await tx.ticket.update({
        data: { escalationSummaryStatus: "FAILED" },
        where: { id: ticketId },
      });
      await tx.aiActivity.create({
        data: {
          eventType: "SUMMARY_GENERATED",
          id: randomUUID(),
          metadata: { outcome: "FAILED" },
          ticketId,
          workspaceId,
        },
      });
    });
  }
  await publishTicketQueueEvent(workspaceId);
}

async function appendHandoffMessage(input: {
  humanAgentName: string;
  ticketId: string;
  workspaceId: string;
}) {
  const content = `Hello, I’m ${input.humanAgentName} from the support team. I’ll continue helping you.`;
  return unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({
      data: { messageSeq: { increment: 1 } },
      where: { id: input.ticketId },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { ticketId: input.ticketId },
    });
    const message = await tx.message.create({
      data: {
        content,
        externalMessageId: `handoff:${randomUUID()}`,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content },
        position: ticket.messageSeq,
        role: "system",
        runId: randomUUID(),
        senderType: "SYSTEM",
        ticketId: input.ticketId,
        turn: ticket.messageSeq,
        workspaceId: input.workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "HANDOFF_SENT",
        id: randomUUID(),
        metadata: { humanAgentName: input.humanAgentName },
        ticketId: input.ticketId,
        workspaceId: input.workspaceId,
      },
    });
    return message;
  });
}

export async function reassignTicket(ticketId: string, humanAgentId: string, workspaceId: string) {
  const humanAgent = await prisma.user.findFirst({
    select: { id: true },
    where: { id: humanAgentId, role: "HUMAN_AGENT" },
  });
  if (!humanAgent) throw new HumanAgentNotFoundError();
  const ticket = await prisma.ticket.update({
    data: { assignedHumanAgentId: humanAgent.id, status: "HUMAN_HANDLING" },
    select: ticketSelect,
    where: { id: ticketId },
  });
  await publishTicketQueueEvent(workspaceId);
  return ticket;
}
