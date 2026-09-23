import { prisma, unscopedPrisma } from "../../utils/prisma";
import { withWorkspaceContext } from "../../utils/workspace-context";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { getAnalyticsOverview, getAnalyticsTraffic } from "../analytics/services";
import { getAiUsageSummary, getToolUsage } from "../ai-usage/services";

export async function listWorkspaces({
  search,
  page,
  limit,
}: {
  search?: string;
  page: number;
  limit: number;
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
  const [workspaces, total] = await Promise.all([
    unscopedPrisma.workspace.findMany({
      where,
      select: { id: true, name: true, slug: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    unscopedPrisma.workspace.count({ where }),
  ]);
  const ids = workspaces.map((workspace) => workspace.id);
  if (!ids.length) return { workspaces: [], total, page, limit };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [users, balances, spend, activity] = await Promise.all([
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
  ]);
  return {
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      userCount: users.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0,
      balance: balances.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0,
      activeUnlimitedPeriod: null,
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
    ]);
    return {
      workspace,
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
