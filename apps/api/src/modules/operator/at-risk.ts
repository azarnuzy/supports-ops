import { unscopedPrisma } from "../../utils/prisma";
import { lowBalanceThreshold } from "../credits/services";
import { resolveRange } from "../analytics/services";

const unlimitedEndingWindowMs = 7 * 24 * 60 * 60 * 1000;
const inactivityWindowMs = 14 * 24 * 60 * 60 * 1000;

export type AtRiskCondition =
  | "CREDIT_EXHAUSTED"
  | "LOW_BALANCE"
  | "UNLIMITED_ENDING_SOON"
  | "INACTIVE"
  | "CHANNEL_ISSUE"
  | "KNOWLEDGE_INGESTION_ISSUE";

export type AttentionDetail = {
  balance: number;
  activeUnlimitedPeriod: { endAt: Date | null } | null;
  lastCustomerActivityAt: Date | null;
  conditions: AtRiskCondition[];
};

/** Computes the four attention conditions for a set of Workspace ids, keyed by id. */
export async function getAttentionDetails(ids: string[]): Promise<Map<string, AttentionDetail>> {
  if (!ids.length) return new Map();
  const now = new Date();
  const [balances, activePeriods, activity] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _sum: { credits: true },
    }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: {
        workspaceId: { in: ids },
        endedEarlyAt: null,
        OR: [{ endAt: null }, { endAt: { gt: now } }],
      },
      select: { workspaceId: true, endAt: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _max: { customerLastMessageAt: true },
    }),
  ]);

  const inactiveSince = new Date(now.getTime() - inactivityWindowMs);
  const endingSoonBy = new Date(now.getTime() + unlimitedEndingWindowMs);

  const map = new Map<string, AttentionDetail>();
  for (const id of ids) {
    const balance = balances.find((row) => row.workspaceId === id)?._sum.credits ?? 0;
    const activePeriod = activePeriods.find((row) => row.workspaceId === id) ?? null;
    const lastCustomerActivityAt =
      activity.find((row) => row.workspaceId === id)?._max.customerLastMessageAt ?? null;

    const conditions: AtRiskCondition[] = [];
    if (!activePeriod) {
      if (balance <= 0) conditions.push("CREDIT_EXHAUSTED");
      else if (balance < lowBalanceThreshold) conditions.push("LOW_BALANCE");
    }
    if (activePeriod?.endAt && activePeriod.endAt <= endingSoonBy)
      conditions.push("UNLIMITED_ENDING_SOON");
    if (lastCustomerActivityAt === null || lastCustomerActivityAt < inactiveSince)
      conditions.push("INACTIVE");

    map.set(id, {
      balance,
      activeUnlimitedPeriod: activePeriod ? { endAt: activePeriod.endAt } : null,
      lastCustomerActivityAt,
      conditions,
    });
  }
  return map;
}

/** A Workspace matching several conditions appears once, listing all of them. */
export async function listAtRiskWorkspaces(range: { from?: string; to?: string } = {}) {
  const { startAt, endAt } = resolveRange(range);
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  const ids = workspaces.map((workspace) => workspace.id);
  const [details, channels, failedSources, sessions] = await Promise.all([
    getAttentionDetails(ids),
    unscopedPrisma.channel.findMany({
      where: { workspaceId: { in: ids }, deletedAt: null },
      select: {
        workspaceId: true,
        type: true,
        status: true,
        whatsAppConfig: { select: { accessTokenFailedAt: true } },
      },
    }),
    unscopedPrisma.knowledgeSource.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, deletedAt: null, status: "FAILED" },
      _count: { _all: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, createdAt: { gte: startAt, lt: endAt } },
      _count: { _all: true },
    }),
  ]);

  const rows = workspaces.map((workspace) => {
    const info = details.get(workspace.id);
    if (!info) throw new Error(`missing attention details for workspace ${workspace.id}`);
    const channelIssues = channels.filter(
      (channel) =>
        channel.workspaceId === workspace.id &&
        (channel.status === "INACTIVE" || Boolean(channel.whatsAppConfig?.accessTokenFailedAt)),
    );
    const failedKnowledgeSources =
      failedSources.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0;
    return {
      ...workspace,
      ...info,
      conditions: [
        ...info.conditions,
        ...(channelIssues.length ? ["CHANNEL_ISSUE" as const] : []),
        ...(failedKnowledgeSources ? ["KNOWLEDGE_INGESTION_ISSUE" as const] : []),
      ],
      channelIssues: channelIssues.map((channel) => ({
        type: channel.type,
        reason: channel.whatsAppConfig?.accessTokenFailedAt ? "Connection error" : "Inactive",
      })),
      failedKnowledgeSources,
      channels: channels
        .filter((channel) => channel.workspaceId === workspace.id)
        .map((channel) => channel.type),
      sessionCount: sessions.find((row) => row.workspaceId === workspace.id)?._count._all ?? 0,
    };
  });
  return { workspaces: rows.filter((row) => row.conditions.length > 0) };
}
