import type { TicketStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { AnalyticsRangeQuery } from "./schema";
import type {
  AnalyticsAgentStat,
  AnalyticsChannelCount,
  AnalyticsDailyTrend,
  AnalyticsHourBucket,
  AnalyticsOverview,
  AnalyticsTraffic,
  ResolutionFigure,
} from "./types";

/** Fixed order and completeness for the status spread, independent of which
 * statuses currently have rows. */
const ticketStatuses: TicketStatus[] = ["AI_HANDLING", "ESCALATED", "HUMAN_HANDLING", "RESOLVED"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Default window when a request carries no from/to: trailing 7 calendar
 * days ending today, inclusive. */
const DEFAULT_RANGE_DAYS = 7;

/** The half-open UTC window behind a response's inclusive from/to dates. */
export type ResolvedRange = { from: string; to: string; startAt: Date; endAt: Date };

/** UTC midnight of a YYYY-MM-DD calendar date, as validated by the router. */
function utcDayStart(date: string): Date {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Absent from/to fall back to the trailing DEFAULT_RANGE_DAYS calendar days
 * ending today (UTC); an explicit `to` widens to an exclusive end so the
 * last day counts whole. */
export function resolveRange(query: AnalyticsRangeQuery): ResolvedRange {
  const today = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
  );
  if (query.from === undefined || query.to === undefined) {
    const startAt = addDays(today, -(DEFAULT_RANGE_DAYS - 1));
    return {
      from: startAt.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
      startAt,
      endAt: addDays(today, 1),
    };
  }
  return {
    from: query.from,
    to: query.to,
    startAt: utcDayStart(query.from),
    endAt: addDays(utcDayStart(query.to), 1),
  };
}

/** Buckets timestamps into the hourly slots covering [start, end), computed
 * here in application code rather than a SQL date_trunc/GROUP BY. Buckets
 * are always complete: an hour with no Tickets still appears with count 0. */
function bucketByHour(timestamps: Date[], start: Date, end: Date): AnalyticsHourBucket[] {
  const hours = Math.round((end.getTime() - start.getTime()) / HOUR_MS);
  const counts = new Array<number>(hours).fill(0);
  for (const timestamp of timestamps) {
    const index = Math.floor((timestamp.getTime() - start.getTime()) / HOUR_MS);
    if (index >= 0 && index < hours) counts[index] += 1;
  }
  return counts.map((count, index) => ({
    hourStart: new Date(start.getTime() + index * HOUR_MS).toISOString(),
    count,
  }));
}

type TrendTicket = {
  createdAt: Date;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolutionReason: string | null;
};

/** Daily created / AI-confirmed-resolved / escalated counts across `days`
 * UTC days starting at `start`. Buckets are always complete: a day with no
 * activity still appears with count 0, mirroring the hourly traffic window. */
function bucketByDay(tickets: TrendTicket[], start: Date, days: number): AnalyticsDailyTrend[] {
  const buckets = Array.from({ length: days }, (_, index) => ({
    date: addDays(start, index).toISOString().slice(0, 10),
    created: 0,
    aiResolved: 0,
    escalated: 0,
  }));
  const dayIndex = (timestamp: Date) =>
    Math.floor((timestamp.getTime() - start.getTime()) / DAY_MS);
  for (const ticket of tickets) {
    const created = dayIndex(ticket.createdAt);
    if (created >= 0 && created < days) buckets[created].created += 1;
    if (ticket.escalatedAt) {
      const index = dayIndex(ticket.escalatedAt);
      if (index >= 0 && index < days) buckets[index].escalated += 1;
    }
    if (ticket.resolvedAt && ticket.resolutionReason === "CUSTOMER_CONFIRMED") {
      const index = dayIndex(ticket.resolvedAt);
      if (index >= 0 && index < days) buckets[index].aiResolved += 1;
    }
  }
  return buckets;
}

/** Shares are rounded to four decimals; a Workspace without Tickets has no
 * meaningful rate, so the figure stays null rather than reading as 0%. */
function rateShare(count: number, totalTickets: number): number | null {
  if (totalTickets === 0) {
    return null;
  }
  return Math.round((count / totalTickets) * 10000) / 10000;
}

/**
 * All figures except `openTicketCount` are scoped to the request's date
 * range by Ticket.createdAt (resolutions by resolvedAt, escalations bucketed
 * by escalatedAt) and to the request's Workspace by the data layer. They
 * share one denominator — every non-deleted Ticket created in the range — so
 * the AI resolution split and the human escalation rate stay directly
 * comparable.
 */
export async function getAnalyticsOverview(
  query: AnalyticsRangeQuery = {},
): Promise<AnalyticsOverview> {
  requireWorkspaceId();

  const { from, to, startAt, endAt } = resolveRange(query);
  const notDeleted = { deletedAt: null };
  const createdInRange = { ...notDeleted, createdAt: { gte: startAt, lt: endAt } };

  const [
    totalTickets,
    confirmedCount,
    inactiveCount,
    handledIdleCount,
    sharedQueueIdleCount,
    escalatedCount,
    statusGroups,
    channelGroups,
    openAgentGroups,
    resolvedGroups,
    channels,
    trendTickets,
    assignedInRange,
  ] = await Promise.all([
    prisma.ticket.count({ where: createdInRange }),
    prisma.ticket.count({
      where: { ...createdInRange, resolutionReason: "CUSTOMER_CONFIRMED" },
    }),
    prisma.ticket.count({
      where: { ...createdInRange, resolutionReason: "CUSTOMER_INACTIVE" },
    }),
    prisma.ticket.count({
      where: { ...createdInRange, resolutionReason: "CUSTOMER_INACTIVE_HUMAN_HANDLING" },
    }),
    prisma.ticket.count({
      where: { ...createdInRange, resolutionReason: "CUSTOMER_INACTIVE_SHARED_QUEUE" },
    }),
    prisma.ticket.count({ where: { ...createdInRange, escalatedAt: { not: null } } }),
    prisma.ticket.groupBy({ by: ["status"], where: createdInRange, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["channelId"], where: createdInRange, _count: { _all: true } }),
    // Point-in-time load, deliberately outside the date range: a Ticket
    // handled today may have been opened long before the window.
    prisma.ticket.groupBy({
      by: ["assignedHumanAgentId"],
      where: { ...notDeleted, status: "HUMAN_HANDLING" },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["resolvedBy"],
      where: { ...notDeleted, resolvedAt: { gte: startAt, lt: endAt }, resolvedBy: { not: null } },
      _count: { _all: true },
    }),
    prisma.channel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ticket.findMany({
      where: {
        ...notDeleted,
        OR: [
          { createdAt: { gte: startAt, lt: endAt } },
          { escalatedAt: { gte: startAt, lt: endAt } },
          { resolvedAt: { gte: startAt, lt: endAt } },
        ],
      },
      select: {
        createdAt: true,
        escalatedAt: true,
        resolvedAt: true,
        resolutionReason: true,
      },
    }),
    prisma.ticket.findMany({
      where: { ...createdInRange, assignedHumanAgentId: { not: null } },
      select: { id: true, assignedHumanAgentId: true, createdAt: true },
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
  const humanIdleClosure = {
    handled: { count: handledIdleCount, rate: rateShare(handledIdleCount, totalTickets) },
    sharedQueue: {
      count: sharedQueueIdleCount,
      rate: rateShare(sharedQueueIdleCount, totalTickets),
    },
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

  // One stat row per Human Agent that is load-bearing anywhere in the
  // window: holding open Tickets, resolving inside the range, or assigned to
  // a Ticket created inside the range.
  const statIds = [
    ...new Set([
      ...openAgentGroups.flatMap((group) =>
        group.assignedHumanAgentId ? [group.assignedHumanAgentId] : [],
      ),
      ...resolvedGroups.flatMap((group) => (group.resolvedBy ? [group.resolvedBy] : [])),
      ...assignedInRange.flatMap((ticket) =>
        ticket.assignedHumanAgentId ? [ticket.assignedHumanAgentId] : [],
      ),
    ]),
  ];
  const agents = statIds.length
    ? await prisma.user.findMany({
        where: { id: { in: statIds }, role: "HUMAN_AGENT" },
        select: { id: true, name: true },
      })
    : [];

  const firstReplies = assignedInRange.length
    ? await prisma.message.groupBy({
        by: ["ticketId"],
        _min: { createdAt: true },
        where: {
          ticketId: { in: assignedInRange.map((ticket) => ticket.id) },
          senderType: "HUMAN_AGENT",
          deletedAt: null,
        },
      })
    : [];
  const firstReplyAtByTicket = new Map(
    firstReplies.flatMap((reply) =>
      reply._min.createdAt ? [[reply.ticketId, reply._min.createdAt] as const] : [],
    ),
  );

  const agentStats: AnalyticsAgentStat[] = agents
    .map((agent) => {
      const assigned = assignedInRange.filter((ticket) => ticket.assignedHumanAgentId === agent.id);
      // Tickets without a human reply never join the average — neither as
      // numerator nor as denominator.
      const latencies = assigned.flatMap((ticket) => {
        const firstReplyAt = firstReplyAtByTicket.get(ticket.id);
        return firstReplyAt ? [(firstReplyAt.getTime() - ticket.createdAt.getTime()) / 1000] : [];
      });
      return {
        humanAgentId: agent.id,
        humanAgentName: agent.name,
        openTicketCount:
          openAgentGroups.find((group) => group.assignedHumanAgentId === agent.id)?._count._all ??
          0,
        resolvedCount:
          resolvedGroups.find((group) => group.resolvedBy === agent.id)?._count._all ?? 0,
        avgFirstResponseSeconds: latencies.length
          ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
          : null,
      };
    })
    .sort(
      (a, b) =>
        b.openTicketCount - a.openTicketCount || a.humanAgentName.localeCompare(b.humanAgentName),
    );

  const trends = bucketByDay(
    trendTickets,
    startAt,
    Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS),
  );

  return {
    totalTickets,
    aiResolution: { customerConfirmed, customerInactive },
    humanEscalation,
    humanIdleClosure,
    statusCounts,
    channelCounts,
    range: { from, to },
    agentStats,
    trends,
  };
}

/**
 * Hourly Ticket traffic and resolutions across the request's date range,
 * scoped to the request's Workspace — created Tickets by createdAt,
 * resolutions by resolvedAt. Buckets are always complete: an hour with no
 * Tickets still appears with count 0.
 */
export async function getAnalyticsTraffic(
  query: AnalyticsRangeQuery = {},
): Promise<AnalyticsTraffic> {
  requireWorkspaceId();

  const { from, to, startAt, endAt } = resolveRange(query);
  const notDeleted = { deletedAt: null };

  const [createdTickets, resolvedTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...notDeleted, createdAt: { gte: startAt, lt: endAt } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { ...notDeleted, resolvedAt: { gte: startAt, lt: endAt } },
      select: { resolvedAt: true },
    }),
  ]);

  return {
    range: { from, to },
    traffic: bucketByHour(
      createdTickets.map((ticket) => ticket.createdAt),
      startAt,
      endAt,
    ),
    resolutions: bucketByHour(
      resolvedTickets.flatMap((ticket) => (ticket.resolvedAt ? [ticket.resolvedAt] : [])),
      startAt,
      endAt,
    ),
  };
}
