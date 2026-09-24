import { ChannelType, ResolutionReason } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { recordTopUp } from "../credits/services";
import { bucketByDay, getTicketStatusCounts, resolveRange } from "../analytics/services";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { unscopedPrisma } from "../../utils/prisma";

export async function getModelMargin(query: AnalyticsRangeQuery = {}) {
  const { from, to, startAt, endAt } = resolveRange(query);
  const rows = await unscopedPrisma.creditLedgerEntry.groupBy({
    by: ["agentModel", "credits"],
    where: { type: "SPEND", createdAt: { gte: startAt, lt: endAt } },
    _count: { _all: true },
    _sum: { providerCostUsd: true },
  });
  const models = new Map<
    string,
    {
      agentModel: string;
      aiTurns: number;
      unlimitedTurns: number;
      creditsCharged: number;
      providerCostUsd: number;
      chargedProviderCostUsd: number;
    }
  >();

  for (const row of rows) {
    const agentModel = row.agentModel ?? "unknown";
    const model = models.get(agentModel) ?? {
      agentModel,
      aiTurns: 0,
      unlimitedTurns: 0,
      creditsCharged: 0,
      providerCostUsd: 0,
      chargedProviderCostUsd: 0,
    };
    const cost = row._sum.providerCostUsd ?? 0;
    model.aiTurns += row._count._all;
    model.providerCostUsd += cost;
    if (row.credits === 0) model.unlimitedTurns += row._count._all;
    else {
      model.creditsCharged -= row.credits * row._count._all;
      model.chargedProviderCostUsd += cost;
    }
    models.set(agentModel, model);
  }

  return {
    range: { from, to },
    models: [...models.values()]
      .sort((a, b) => a.agentModel.localeCompare(b.agentModel))
      .map(({ chargedProviderCostUsd, ...model }) => ({
        ...model,
        usdPerCredit: model.creditsCharged ? chargedProviderCostUsd / model.creditsCharged : null,
      })),
  };
}

/** The same scope can be used for one Workspace or the whole platform. */
export async function getOperatorOverview(query: AnalyticsRangeQuery = {}, workspaceId?: string) {
  const { from, to, startAt, endAt } = resolveRange(query);
  const scope = workspaceId ? { workspaceId } : {};
  const createdAt = { gte: startAt, lt: endAt };
  const duration = endAt.getTime() - startAt.getTime();
  const previousAt = { gte: new Date(startAt.getTime() - duration), lt: startAt };
  const activeWhere = {
    ...scope,
    deletedAt: null,
    senderType: "CUSTOMER" as const,
    session: { workspace: { deletedAt: null } },
  };
  const [
    workspaces,
    newWorkspaces,
    sessions,
    statusCounts,
    reasons,
    resolvedReasons,
    credits,
    payments,
    active,
    previousActive,
    previousNew,
    previousSessions,
    previousCredits,
    previousPayments,
    workspaceSessions,
    previousWorkspaceSessions,
  ] = await Promise.all([
    unscopedPrisma.workspace.count({ where: { ...scope, deletedAt: null } }),
    unscopedPrisma.workspace.count({ where: { ...scope, deletedAt: null, createdAt } }),
    unscopedPrisma.session.groupBy({
      by: ["channelId"],
      where: { ...scope, createdAt },
      _count: { _all: true },
    }),
    getTicketStatusCounts(startAt, endAt, workspaceId),
    unscopedPrisma.ticket.groupBy({
      by: ["resolutionReason"],
      where: { ...scope, deletedAt: null, createdAt, resolutionReason: { not: null } },
      _count: { _all: true },
    }),
    unscopedPrisma.ticket.groupBy({
      by: ["resolutionReason"],
      where: { ...scope, deletedAt: null, resolvedAt: createdAt, resolutionReason: { not: null } },
      _count: { _all: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["type"],
      where: { ...scope, createdAt },
      _sum: { credits: true, providerCostUsd: true },
    }),
    unscopedPrisma.topUpPayment.aggregate({
      where: { ...scope, status: "PAID", paidAt: createdAt },
      _sum: { amountIdr: true },
    }),
    unscopedPrisma.message.groupBy({
      by: ["workspaceId"],
      where: { ...activeWhere, createdAt },
      _count: { _all: true },
    }),
    unscopedPrisma.message.groupBy({
      by: ["workspaceId"],
      where: { ...activeWhere, createdAt: previousAt },
      _count: { _all: true },
    }),
    unscopedPrisma.workspace.count({ where: { ...scope, deletedAt: null, createdAt: previousAt } }),
    unscopedPrisma.session.count({ where: { ...scope, createdAt: previousAt } }),
    unscopedPrisma.creditLedgerEntry.aggregate({
      where: { ...scope, type: "SPEND", createdAt: previousAt },
      _sum: { credits: true, providerCostUsd: true },
    }),
    unscopedPrisma.topUpPayment.aggregate({
      where: { ...scope, status: "PAID", paidAt: previousAt },
      _sum: { amountIdr: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { ...scope, workspace: { deletedAt: null }, createdAt },
      _count: { _all: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { ...scope, workspace: { deletedAt: null }, createdAt: previousAt },
      _count: { _all: true },
    }),
  ]);
  const channelIds = sessions.map((row) => row.channelId);
  const topGroups = [...workspaceSessions]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 5);
  const [channels, topWorkspaces] = await Promise.all([
    unscopedPrisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, type: true },
    }),
    unscopedPrisma.workspace.findMany({
      where: { id: { in: topGroups.map((row) => row.workspaceId) } },
      select: { id: true, name: true },
    }),
  ]);
  const sessionCount = (type: ChannelType) =>
    sessions.reduce(
      (sum, row) =>
        sum +
        (channels.find((channel) => channel.id === row.channelId)?.type === type
          ? row._count._all
          : 0),
      0,
    );
  const creditTotal = (type: "SPEND" | "TOP_UP" | "TRIAL_GRANT") =>
    credits.find((row) => row.type === type)?._sum.credits ?? 0;

  return {
    range: { from, to },
    workspaces: { total: workspaces, active: active.length, new: newWorkspaces },
    previous: {
      activeWorkspaces: previousActive.length,
      newWorkspaces: previousNew,
      sessions: previousSessions,
      creditsSpent: -(previousCredits._sum.credits ?? 0),
      revenueIdr: previousPayments._sum.amountIdr ?? 0,
      providerCostUsd: previousCredits._sum.providerCostUsd ?? 0,
    },
    topWorkspaces: topGroups.map((row) => ({
      id: row.workspaceId,
      name:
        topWorkspaces.find((workspace) => workspace.id === row.workspaceId)?.name ?? "Workspace",
      sessions: row._count._all,
      previousSessions:
        previousWorkspaceSessions.find((previous) => previous.workspaceId === row.workspaceId)
          ?._count._all ?? 0,
    })),
    sessions: Object.fromEntries(
      Object.values(ChannelType).map((type) => [type, sessionCount(type)]),
    ),
    tickets: {
      byStatus: Object.fromEntries(statusCounts.map(({ status, count }) => [status, count])),
      byResolutionReason: Object.fromEntries(
        Object.values(ResolutionReason).map((reason) => [
          reason,
          reasons.find((row) => row.resolutionReason === reason)?._count._all ?? 0,
        ]),
      ),
      resolvedByReason: Object.fromEntries(
        Object.values(ResolutionReason).map((reason) => [
          reason,
          resolvedReasons.find((row) => row.resolutionReason === reason)?._count._all ?? 0,
        ]),
      ),
    },
    credits: {
      spent: -creditTotal("SPEND"),
      topUps: creditTotal("TOP_UP"),
      trialGrants: creditTotal("TRIAL_GRANT"),
    },
    revenueIdr: payments._sum.amountIdr ?? 0,
    providerCostUsd: credits.find((row) => row.type === "SPEND")?._sum.providerCostUsd ?? 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** One count bucket per UTC day; a day with no Sessions still appears with
 * count 0, mirroring the Ticket trend buckets. */
function bucketSessionsByDay(sessions: { createdAt: Date }[], start: Date, days: number) {
  const buckets = Array.from({ length: days }, (_, index) => ({
    date: new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    count: 0,
  }));
  for (const session of sessions) {
    const index = Math.floor((session.createdAt.getTime() - start.getTime()) / DAY_MS);
    if (index >= 0 && index < days) buckets[index].count += 1;
  }
  return buckets;
}

/** Platform idle closure (assigned to a Human Agent) and abandoned Shared
 * Human Queue outcomes are excluded from both sides of the rate: they are
 * neither an AI nor a countable human success. */
const excludedFromAiEffectiveness = new Set([
  "CUSTOMER_INACTIVE_HUMAN_HANDLING",
  "CUSTOMER_INACTIVE_SHARED_QUEUE",
]);

function getAiEffectiveness(
  tickets: { resolvedAt: Date | null; resolutionReason: string | null }[],
  startAt: Date,
  endAt: Date,
) {
  const resolvedInRange = tickets.filter(
    (ticket) =>
      ticket.resolvedAt &&
      ticket.resolvedAt >= startAt &&
      ticket.resolvedAt < endAt &&
      ticket.resolutionReason &&
      !excludedFromAiEffectiveness.has(ticket.resolutionReason),
  );
  const aiResolvedCount = resolvedInRange.filter(
    (ticket) => ticket.resolutionReason === "CUSTOMER_CONFIRMED",
  ).length;
  return {
    count: aiResolvedCount,
    total: resolvedInRange.length,
    rate: resolvedInRange.length
      ? Math.round((aiResolvedCount / resolvedInRange.length) * 10000) / 10000
      : null,
  };
}

/**
 * Cross-Workspace daily Session and Ticket series for the request's date
 * range, plus the AI-effectiveness rate among Tickets resolved in range.
 * Sessions are counted by createdAt; a Session may have no Ticket, so this
 * never derives from Ticket rows. Ticket trend buckets reuse the same
 * created/escalated/resolved definitions as the Workspace-scoped analytics
 * trend, run here unscoped across every Workspace.
 */
export async function getPlatformAnalyticsTrends(query: AnalyticsRangeQuery = {}) {
  const { from, to, startAt, endAt } = resolveRange(query);
  const days = Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS);

  const [sessions, tickets] = await Promise.all([
    unscopedPrisma.session.findMany({
      where: { createdAt: { gte: startAt, lt: endAt } },
      select: { createdAt: true },
    }),
    unscopedPrisma.ticket.findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdAt: { gte: startAt, lt: endAt } },
          { escalatedAt: { gte: startAt, lt: endAt } },
          { resolvedAt: { gte: startAt, lt: endAt } },
        ],
      },
      select: { createdAt: true, escalatedAt: true, resolvedAt: true, resolutionReason: true },
    }),
  ]);

  return {
    range: { from, to },
    sessions: bucketSessionsByDay(sessions, startAt, days),
    tickets: bucketByDay(tickets, startAt, days),
    aiEffectiveness: getAiEffectiveness(tickets, startAt, endAt),
  };
}

export async function topUpWorkspace(
  operatorId: string,
  workspaceId: string,
  credits: number,
  note: string,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!workspace) return null;
    const entry = await recordTopUp(tx, workspaceId, credits, note);
    const action = await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId,
        type: "TOP_UP",
        payload: { creditLedgerEntryId: entry.id, credits, note },
      },
    });
    const balance = await tx.creditLedgerEntry.aggregate({
      where: { workspaceId },
      _sum: { credits: true },
    });
    return { action, balance: balance._sum.credits ?? 0 };
  });
}
