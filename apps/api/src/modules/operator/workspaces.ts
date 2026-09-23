import { prisma, unscopedPrisma } from "../../utils/prisma";
import { withWorkspaceContext } from "../../utils/workspace-context";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { getAnalyticsOverview, getAnalyticsTraffic } from "../analytics/services";
import { getAiUsageSummary, getToolUsage } from "../ai-usage/services";
import { currentOrLastUnlimitedPeriod } from "./unlimited-periods";
import { type AtRiskCondition, getAttentionDetails } from "./at-risk";

export async function listWorkspaces({
  search,
  page,
  limit,
  sortBy = "createdAt",
  attention,
}: {
  search?: string;
  page: number;
  limit: number;
  sortBy?: "createdAt" | "name";
  attention?: AtRiskCondition;
}) {
  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const orderBy =
    sortBy === "name"
      ? [{ name: "asc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const select = { id: true, name: true, slug: true, createdAt: true } as const;

  let workspaces: { id: string; name: string; slug: string; createdAt: Date }[];
  let total: number;
  if (attention) {
    const matching = await unscopedPrisma.workspace.findMany({ where, select, orderBy });
    const details = await getAttentionDetails(matching.map((workspace) => workspace.id));
    const filtered = matching.filter((workspace) =>
      details.get(workspace.id)?.conditions.includes(attention),
    );
    total = filtered.length;
    workspaces = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);
  } else {
    [workspaces, total] = await Promise.all([
      unscopedPrisma.workspace.findMany({
        where,
        select,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      unscopedPrisma.workspace.count({ where }),
    ]);
  }
  const ids = workspaces.map((workspace) => workspace.id);
  if (!ids.length) return { workspaces: [], total, page, limit };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [users, balances, spend, activity, unlimitedPeriods] = await Promise.all([
    unscopedPrisma.user.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _sum: { credits: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, type: "SPEND", createdAt: { gte: thirtyDaysAgo } },
      _sum: { credits: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _max: { customerLastMessageAt: true },
    }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: { workspaceId: { in: ids }, endedEarlyAt: null, endAt: { gt: new Date() } },
      select: { workspaceId: true, endAt: true },
    }),
  ]);
  return {
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      userCount: users.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0,
      balance: balances.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0,
      activeUnlimitedPeriod:
        unlimitedPeriods
          .filter((row) => row.workspaceId === workspace.id)
          .map((row) => ({ endAt: row.endAt }))[0] ?? null,
      lastCustomerActivityAt:
        activity.find((row) => row.workspaceId === workspace.id)?._max.customerLastMessageAt ??
        null,
      creditSpend30Days: -(
        spend.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0
      ),
    })),
    total,
    page,
    limit,
  };
}

export async function getWorkspaceDetail(id: string, range: AnalyticsRangeQuery) {
  const workspace = await unscopedPrisma.workspace.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  if (!workspace) return null;

  return withWorkspaceContext(id, async () => {
    const [
      users,
      channels,
      knowledgeGroups,
      aiAgents,
      analyticsOverview,
      analyticsTraffic,
      aiUsageSummary,
      toolUsage,
      unlimitedPeriod,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          role: true,
          authSessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
        orderBy: { email: "asc" },
      }),
      prisma.channel.findMany({
        where: { deletedAt: null },
        select: {
          type: true,
          status: true,
          whatsAppConfig: { select: { webhookVerifiedAt: true, accessTokenFailedAt: true } },
        },
      }),
      prisma.knowledgeSource.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.aiAgent.findMany({
        select: { id: true, name: true, status: true, agentModel: true },
        orderBy: { name: "asc" },
      }),
      getAnalyticsOverview(range),
      getAnalyticsTraffic(range),
      getAiUsageSummary(range),
      getToolUsage(range),
      currentOrLastUnlimitedPeriod(id),
    ]);
    return {
      workspace,
      unlimitedPeriod: unlimitedPeriod
        ? { endAt: unlimitedPeriod.endAt, endedEarlyAt: unlimitedPeriod.endedEarlyAt }
        : null,
      users: users.map(({ authSessions, ...user }) => ({
        ...user,
        lastSignInAt: authSessions[0]?.createdAt ?? null,
      })),
      channels: {
        webWidgetActive: channels.some(
          (channel) => channel.type === "WEB" && channel.status === "ACTIVE",
        ),
        whatsAppConnected: channels.some(
          (channel) =>
            channel.type === "WHATSAPP" &&
            channel.status === "ACTIVE" &&
            channel.whatsAppConfig !== null &&
            channel.whatsAppConfig.webhookVerifiedAt !== null &&
            !channel.whatsAppConfig.accessTokenFailedAt,
        ),
      },
      knowledgeSources: knowledgeGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      aiAgents,
      analytics: { overview: analyticsOverview, traffic: analyticsTraffic },
      aiUsage: { summary: aiUsageSummary, tools: toolUsage },
    };
  });
}
