import { ChannelType, ResolutionReason } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { recordTopUp } from "../credits/services";
import { getTicketStatusCounts, resolveRange } from "../analytics/services";
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
  const [workspaces, newWorkspaces, sessions, statusCounts, reasons, credits, payments] =
    await Promise.all([
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
      unscopedPrisma.creditLedgerEntry.groupBy({
        by: ["type"],
        where: { ...scope, createdAt },
        _sum: { credits: true, providerCostUsd: true },
      }),
      unscopedPrisma.topUpPayment.aggregate({
        where: { ...scope, status: "PAID", paidAt: createdAt },
        _sum: { amountIdr: true },
      }),
    ]);
  const channelIds = sessions.map((row) => row.channelId);
  const channels = await unscopedPrisma.channel.findMany({
    where: { id: { in: channelIds } },
    select: { id: true, type: true },
  });
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
    workspaces: { total: workspaces, new: newWorkspaces },
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
