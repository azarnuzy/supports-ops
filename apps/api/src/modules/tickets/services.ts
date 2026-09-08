import { randomUUID } from "node:crypto";
import { prisma } from "../../utils/prisma";
import { publishTicketQueueEvent } from "../widget/realtime";

const ticketSelect = {
  assignedHumanAgent: { select: { id: true, name: true } },
  customerIdentity: { select: { name: true } },
  id: true,
  priority: true,
  title: true,
  createdAt: true,
  escalatedAt: true,
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
