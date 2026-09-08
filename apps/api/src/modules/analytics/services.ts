import type { TicketStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type {
  AnalyticsAgentLoad,
  AnalyticsChannelCount,
  AnalyticsOverview,
  ResolutionFigure,
} from "./types";

/** Fixed order and completeness for the status spread, independent of which
 * statuses currently have rows. */
const ticketStatuses: TicketStatus[] = ["AI_HANDLING", "ESCALATED", "HUMAN_HANDLING", "RESOLVED"];

/** Shares are rounded to four decimals; a Workspace without Tickets has no
 * meaningful rate, so the figure stays null rather than reading as 0%. */
function rateShare(count: number, totalTickets: number): number | null {
  if (totalTickets === 0) {
    return null;
  }
  return Math.round((count / totalTickets) * 10000) / 10000;
}

/**
 * All figures are scoped to the request's Workspace by the data layer and
 * share one denominator — every non-deleted Ticket in the Workspace. Every
 * Ticket begins under the AI Agent, so the AI resolution split and the human
 * escalation rate are directly comparable.
 */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  requireWorkspaceId();

  const notDeleted = { deletedAt: null };

  const [
    totalTickets,
    confirmedCount,
    inactiveCount,
    escalatedCount,
    statusGroups,
    channelGroups,
    agentGroups,
    channels,
  ] = await Promise.all([
    prisma.ticket.count({ where: notDeleted }),
    prisma.ticket.count({ where: { ...notDeleted, resolutionReason: "CUSTOMER_CONFIRMED" } }),
    prisma.ticket.count({ where: { ...notDeleted, resolutionReason: "CUSTOMER_INACTIVE" } }),
    prisma.ticket.count({ where: { ...notDeleted, escalatedAt: { not: null } } }),
    prisma.ticket.groupBy({ by: ["status"], where: notDeleted, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["channelId"], where: notDeleted, _count: { _all: true } }),
    prisma.ticket.groupBy({
      by: ["assignedHumanAgentId"],
      where: { ...notDeleted, status: "HUMAN_HANDLING" },
      _count: { _all: true },
    }),
    prisma.channel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const customerConfirmed: ResolutionFigure = {
    count: confirmedCount,
    rate: rateShare(confirmedCount, totalTickets),
  };
  const customerInactive: ResolutionFigure = {
    count: inactiveCount,
    rate: rateShare(inactiveCount, totalTickets),
  };
  const humanEscalation: ResolutionFigure = {
    count: escalatedCount,
    rate: rateShare(escalatedCount, totalTickets),
  };

  const statusCounts = ticketStatuses.map((status) => ({
    status,
    count: statusGroups.find((group) => group.status === status)?._count._all ?? 0,
  }));

  const channelCounts: AnalyticsChannelCount[] = channels.map((channel) => ({
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    ticketCount: channelGroups.find((group) => group.channelId === channel.id)?._count._all ?? 0,
  }));

  const activeAgentIds = agentGroups.flatMap((group) =>
    group.assignedHumanAgentId ? [group.assignedHumanAgentId] : [],
  );
  const agents = activeAgentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: activeAgentIds }, role: "HUMAN_AGENT" },
        select: { id: true, name: true },
      })
    : [];
  const activeTicketsPerHumanAgent: AnalyticsAgentLoad[] = agents
    .map((agent) => ({
      humanAgentId: agent.id,
      humanAgentName: agent.name,
      activeTicketCount:
        agentGroups.find((group) => group.assignedHumanAgentId === agent.id)?._count._all ?? 0,
    }))
    .sort((a, b) => b.activeTicketCount - a.activeTicketCount);

  return {
    totalTickets,
    aiResolution: { customerConfirmed, customerInactive },
    humanEscalation,
    statusCounts,
    channelCounts,
    activeTicketsPerHumanAgent,
  };
}
