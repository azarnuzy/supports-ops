import { unscopedPrisma } from "../../utils/prisma";
import { lowBalanceThreshold } from "../credits/services";
import { resolveRange } from "../analytics/services";

const unlimitedEndingWindowMs = 7 * 24 * 60 * 60 * 1000;
const inactivityWindowMs = 14 * 24 * 60 * 60 * 1000;

export type FinancialCondition = "CREDIT_EXHAUSTED" | "LOW_BALANCE" | "UNLIMITED_ENDING_SOON";
export type OperationalCondition = "INACTIVE" | "CHANNEL_ISSUE" | "KNOWLEDGE_INGESTION_ISSUE";
export type AtRiskCondition = FinancialCondition | OperationalCondition;

const operationalConditions = new Set<AtRiskCondition>([
  "INACTIVE",
  "CHANNEL_ISSUE",
  "KNOWLEDGE_INGESTION_ISSUE",
]);

export type OrganizationAttention = {
  id: string;
  name: string;
  balance: number;
  activeUnlimitedPeriod: { endAt: Date | null } | null;
  workspaceCount: number;
  conditions: FinancialCondition[];
};

export type AttentionDetail = {
  balance: number;
  activeUnlimitedPeriod: { endAt: Date | null } | null;
  lastCustomerActivityAt: Date | null;
  conditions: AtRiskCondition[];
};

/** Computes Workspace-level attention conditions for a set of ids. */
export async function getAttentionDetails(ids: string[]): Promise<Map<string, AttentionDetail>> {
  if (!ids.length) return new Map();
  const now = new Date();
  const [workspaces, balances, activePeriods, activity] = await Promise.all([
    unscopedPrisma.workspace.findMany({
      where: { id: { in: ids } },
      select: { id: true, organizationId: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["organizationId"],
      where: { organization: { workspaces: { some: { id: { in: ids } } } } },
      _sum: { credits: true },
    }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: {
        workspace: { organization: { workspaces: { some: { id: { in: ids } } } } },
        endedEarlyAt: null,
        OR: [{ endAt: null }, { endAt: { gt: now } }],
      },
      select: { workspace: { select: { organizationId: true } }, endAt: true },
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
    const organizationId = workspaces.find((workspace) => workspace.id === id)?.organizationId;
    const balance =
      balances.find((row) => row.organizationId === organizationId)?._sum.credits ?? 0;
    const activePeriod =
      activePeriods.find((row) => row.workspace.organizationId === organizationId) ?? null;
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

/** Financial risk (balance, Unlimited Period) belongs to the Organization: an Organization
 * with several Workspaces reports each condition once, never once per Workspace. */
export async function listAtRiskOrganizations(): Promise<OrganizationAttention[]> {
  const now = new Date();
  const organizations = await unscopedPrisma.organization.findMany({
    select: {
      id: true,
      name: true,
      workspaces: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!organizations.length) return [];
  const ids = organizations.map((organization) => organization.id);
  const [balances, activePeriods] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids } },
      _sum: { credits: true },
    }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: {
        workspace: { organizationId: { in: ids } },
        endedEarlyAt: null,
        OR: [{ endAt: null }, { endAt: { gt: now } }],
      },
      select: { workspace: { select: { organizationId: true } }, endAt: true },
    }),
  ]);
  const endingSoonBy = new Date(now.getTime() + unlimitedEndingWindowMs);

  return organizations
    .map((organization) => {
      const balance =
        balances.find((row) => row.organizationId === organization.id)?._sum.credits ?? 0;
      const activePeriod =
        activePeriods.find((row) => row.workspace.organizationId === organization.id) ?? null;
      const conditions: FinancialCondition[] = [];
      if (!activePeriod) {
        if (balance <= 0) conditions.push("CREDIT_EXHAUSTED");
        else if (balance < lowBalanceThreshold) conditions.push("LOW_BALANCE");
      }
      if (activePeriod?.endAt && activePeriod.endAt <= endingSoonBy)
        conditions.push("UNLIMITED_ENDING_SOON");
      return {
        id: organization.id,
        name: organization.name,
        balance,
        activeUnlimitedPeriod: activePeriod ? { endAt: activePeriod.endAt } : null,
        workspaceCount: organization.workspaces.length,
        conditions,
      };
    })
    .filter((organization) => organization.conditions.length > 0);
}

/** A Workspace matching several operational conditions appears once, listing all of them.
 * Financial risk is reported once per Organization via {@link listAtRiskOrganizations}. */
export async function listAtRiskWorkspaces(range: { from?: string; to?: string } = {}) {
  const { startAt, endAt } = resolveRange(range);
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  const ids = workspaces.map((workspace) => workspace.id);
  const [
    organizations,
    details,
    channels,
    failedSources,
    sessions,
    externalErrors,
    externalEvents,
  ] = await Promise.all([
    listAtRiskOrganizations(),
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
    // ponytail: group the event table directly; add rollups if error volume makes this query slow.
    unscopedPrisma.$queryRaw<
      {
        provider: string;
        operation: string;
        modelId: string | null;
        code: string | null;
        httpStatus: number | null;
        workspaceId: string | null;
        count: number;
        firstAt: Date;
        lastAt: Date;
        resourceType: string | null;
        resourceId: string | null;
      }[]
    >`
      SELECT "provider", "operation", "modelId", "code", "httpStatus", "workspaceId",
        COUNT(*)::int AS "count", MIN("createdAt") AS "firstAt", MAX("createdAt") AS "lastAt",
        (ARRAY_AGG("resourceType" ORDER BY "createdAt" DESC))[1] AS "resourceType",
        (ARRAY_AGG("resourceId" ORDER BY "createdAt" DESC))[1] AS "resourceId"
      FROM "ExternalError"
      GROUP BY "provider", "operation", "modelId", "code", "httpStatus", "workspaceId"
      ORDER BY MAX("createdAt") DESC
    `,
    unscopedPrisma.$queryRaw<
      {
        id: string;
        workspaceId: string | null;
        provider: string;
        operation: string;
        modelId: string | null;
        code: string | null;
        httpStatus: number | null;
        resourceType: string | null;
        resourceId: string | null;
        createdAt: Date;
      }[]
    >`
      SELECT "id", "workspaceId", "provider", "operation", "modelId", "code", "httpStatus",
        "resourceType", "resourceId", "createdAt"
      FROM "ExternalError" ORDER BY "createdAt" DESC LIMIT 100
    `,
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
        ...info.conditions.filter((condition) => operationalConditions.has(condition)),
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
  return {
    organizations,
    externalErrors,
    externalEvents,
    workspaces: rows.filter((row) => row.conditions.length > 0),
  };
}
