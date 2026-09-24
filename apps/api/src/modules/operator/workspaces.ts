import { prisma, unscopedPrisma } from "../../utils/prisma";
import { withWorkspaceContext } from "../../utils/workspace-context";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { getAnalyticsOverview, getAnalyticsTraffic, resolveRange } from "../analytics/services";
import { getAiUsageSummary, getToolUsage } from "../ai-usage/services";
import { currentOrLastUnlimitedPeriod } from "./unlimited-periods";
import { type AtRiskCondition, getAttentionDetails } from "./at-risk";

export async function listWorkspaces({
  search,
  page,
  limit,
  sortBy = "lastCustomerActivityAt",
  sortDirection = sortBy === "name" ? "asc" : "desc",
  attention,
  status,
  channel,
  from,
  to,
}: {
  search?: string;
  page: number;
  limit: number;
  sortBy?: "createdAt" | "name" | "userCount" | "balance" | "unlimitedEndAt" | "lastCustomerActivityAt" | "sessionCount" | "creditsUsed";
  sortDirection?: "asc" | "desc";
  attention?: AtRiskCondition;
  status?: "HEALTHY" | "NEEDS_ATTENTION";
  channel?: "WEB" | "WHATSAPP";
  from?: string;
  to?: string;
}) {
  const { startAt, endAt } = resolveRange({ from, to });
  const duration = endAt.getTime() - startAt.getTime();
  const previousAt = { gte: new Date(startAt.getTime() - duration), lt: startAt };
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
  const select = { id: true, name: true, slug: true, createdAt: true } as const;
  const [workspaces, allChannels] = await Promise.all([
    unscopedPrisma.workspace.findMany({ where, select }),
    unscopedPrisma.channel.findMany({
      where: { deletedAt: null, status: "ACTIVE", workspace: { deletedAt: null } },
      select: { workspaceId: true, type: true, whatsAppConfig: { select: { webhookVerifiedAt: true, accessTokenFailedAt: true } } },
    }),
  ]);
  const readyChannels = allChannels.filter((row) => row.type === "WEB" || (
    row.whatsAppConfig?.webhookVerifiedAt && !row.whatsAppConfig.accessTokenFailedAt
  ));
  const channelCounts = {
    WEB: readyChannels.filter((row) => row.type === "WEB").length,
    WHATSAPP: readyChannels.filter((row) => row.type === "WHATSAPP").length,
  };
  const ids = workspaces.map((workspace) => workspace.id);
  if (!ids.length) return { workspaces: [], total: 0, page, limit, channelCounts };

  const [details, users, sessions, previousSessions, spend, previousSpend] = await Promise.all([
    getAttentionDetails(ids),
    unscopedPrisma.user.findMany({
      where: { workspaceId: { in: ids }, deletedAt: null },
      select: { workspaceId: true, role: true, name: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"], where: { workspaceId: { in: ids }, createdAt: { gte: startAt, lt: endAt } }, _count: { _all: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"], where: { workspaceId: { in: ids }, createdAt: previousAt }, _count: { _all: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"], where: { workspaceId: { in: ids }, type: "SPEND", createdAt: { gte: startAt, lt: endAt } }, _sum: { credits: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"], where: { workspaceId: { in: ids }, type: "SPEND", createdAt: previousAt }, _sum: { credits: true },
    }),
  ]);
  // ponytail: scans matched Workspaces and aggregates in memory; move sorting and paging into SQL if list volume grows.
  const rows = workspaces.map((workspace) => {
    const info = details.get(workspace.id)!;
    const admins = users.filter((user) => user.workspaceId === workspace.id && user.role === "ADMIN");
    return {
      ...workspace,
      userCount: users.filter((user) => user.workspaceId === workspace.id).length,
      adminName: admins[0]?.name ?? null,
      adminCount: admins.length,
      balance: info.balance,
      activeUnlimitedPeriod: info.activeUnlimitedPeriod,
      lastCustomerActivityAt: info.lastCustomerActivityAt,
      conditions: info.conditions,
      channels: readyChannels.filter((row) => row.workspaceId === workspace.id).map((row) => row.type),
      sessionCount: sessions.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0,
      previousSessionCount: previousSessions.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0,
      creditsUsed: -(spend.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0),
      previousCreditsUsed: -(previousSpend.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0),
    };
  }).filter((workspace) =>
    (!attention || workspace.conditions.includes(attention)) &&
    (!status || (status === "HEALTHY" ? workspace.conditions.length === 0 : workspace.conditions.length > 0)) &&
    (!channel || workspace.channels.includes(channel))
  );
  const value = (row: (typeof rows)[number]) => {
    switch (sortBy) {
      case "name": return row.name.toLocaleLowerCase();
      case "userCount": return row.userCount;
      case "balance": return row.balance;
      case "unlimitedEndAt": return row.activeUnlimitedPeriod?.endAt.getTime() ?? null;
      case "sessionCount": return row.sessionCount;
      case "creditsUsed": return row.creditsUsed;
      case "createdAt": return row.createdAt.getTime();
      default: return row.lastCustomerActivityAt?.getTime() ?? null;
    }
  };
  rows.sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null) return right === null ? a.id.localeCompare(b.id) : 1;
    if (right === null) return -1;
    const difference = typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right) : Number(left) - Number(right);
    return (sortDirection === "asc" ? difference : -difference) || a.id.localeCompare(b.id);
  });
  return {
    workspaces: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
    channelCounts,
  };
}

export async function getWorkspaceDetail(id: string, range: AnalyticsRangeQuery) {
  const workspace = await unscopedPrisma.workspace.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  if (!workspace) return null;

  return withWorkspaceContext(id, async () => {
    const { startAt, endAt } = resolveRange(range);
    const previousStartAt = new Date(startAt.getTime() - (endAt.getTime() - startAt.getTime()));
    const monthStartAt = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
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
      attention,
      sessions,
      previousSessionCount,
      outcomes,
      monthCredits,
      lastPayment,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
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
      getAttentionDetails([id]),
      prisma.session.findMany({ where: { createdAt: { gte: startAt, lt: endAt } }, select: { createdAt: true } }),
      prisma.session.count({ where: { createdAt: { gte: previousStartAt, lt: startAt } } }),
      prisma.ticket.groupBy({
        by: ["resolutionReason"],
        where: { deletedAt: null, resolvedAt: { gte: startAt, lt: endAt }, resolutionReason: { not: null } },
        _count: { _all: true },
      }),
      prisma.creditLedgerEntry.groupBy({
        by: ["type"], where: { createdAt: { gte: monthStartAt } }, _sum: { credits: true },
      }),
      prisma.topUpPayment.findFirst({
        where: { status: "PAID" }, orderBy: { paidAt: "desc" },
        select: { id: true, paidAt: true, credits: true, amountIdr: true },
      }),
    ]);
    const sessionsByDay = new Map<string, number>();
    for (const session of sessions) {
      const day = session.createdAt.toISOString().slice(0, 10);
      sessionsByDay.set(day, (sessionsByDay.get(day) ?? 0) + 1);
    }
    return {
      workspace,
      attention: attention.get(id)!,
      sessions: {
        count: sessions.length,
        previousCount: previousSessionCount,
        daily: aiUsageSummary.daily.map(({ date }) => ({ date, count: sessionsByDay.get(date) ?? 0 })),
      },
      outcomes: outcomes.map((row) => ({ reason: row.resolutionReason!, count: row._count._all })),
      billing: {
        toppedUpThisMonth: monthCredits.find((row) => row.type === "TOP_UP")?._sum.credits ?? 0,
        spentThisMonth: -(monthCredits.find((row) => row.type === "SPEND")?._sum.credits ?? 0),
        lastPayment,
      },
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
