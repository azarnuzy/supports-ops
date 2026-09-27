import { creditBalance, organizationIdForWorkspace } from "../credits/services";
import { prisma, unscopedPrisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { resolveRange } from "../analytics/services";
import type { ChannelType } from "@prisma/client";
import { ledgerListDefaultLimit, type AiUsageFilters, type AiUsageQuery } from "./schema";
import type {
  AiUsageAgentBreakdown,
  AiUsageChannelBreakdown,
  AiUsageModelBreakdown,
  AiUsageSummary,
  AiUsageTools,
  CreditLedgerPage,
  UsageTotals,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ListCreditLedgerInput = { cursor?: string; limit?: number };

export class InvalidLedgerCursorError extends Error {}

type SpendRow = {
  workspaceId: string;
  aiAgentId: string | null;
  agentModel: string | null;
  channel: ChannelType | null;
  createdAt: Date;
  credits: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  sessionId: string | null;
};

function emptyTotals(): UsageTotals {
  return { creditsSpent: 0, turnCount: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

/** Tokens are summed only over Turns that recorded them; spend from before
 * Tokens were recorded still counts towards Credits and AI Turns. */
function addRow(totals: UsageTotals, row: SpendRow) {
  totals.creditsSpent += -row.credits;
  totals.turnCount += 1;
  totals.inputTokens += row.inputTokens ?? 0;
  totals.cachedInputTokens += row.cachedInputTokens ?? 0;
  totals.outputTokens += row.outputTokens ?? 0;
}

function groupBy(rows: SpendRow[], keyOf: (row: SpendRow) => string | null) {
  const groups = new Map<string, UsageTotals>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const totals = groups.get(key) ?? emptyTotals();
    addRow(totals, row);
    groups.set(key, totals);
  }
  return groups;
}

function spendWhere(filters: AiUsageFilters, startAt: Date, endAt: Date) {
  return {
    type: "SPEND" as const,
    createdAt: { gte: startAt, lt: endAt },
    ...(filters.aiAgentId ? { aiAgentId: filters.aiAgentId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
  };
}

/**
 * Balance, totals against the equally long period before, a zero-filled daily
 * series, and breakdowns by AI Agent, Agent Model, and Channel — all from the
 * Credit Ledger's SPEND entries, never Telemetry. Everything but the balance
 * is scoped to the requested range and filters.
 */
export async function getAiUsageSummary(
  query: AiUsageQuery = {},
  organization = false,
): Promise<AiUsageSummary> {
  const workspaceId = requireWorkspaceId();
  const organizationId = organization
    ? await organizationIdForWorkspace(unscopedPrisma, workspaceId)
    : null;
  const { from, to, startAt, endAt } = resolveRange(query);
  const previousStartAt = new Date(startAt.getTime() - (endAt.getTime() - startAt.getTime()));

  const [balance, spendRows, previousRows] = await Promise.all([
    creditBalance(workspaceId),
    unscopedPrisma.creditLedgerEntry.findMany({
      where: {
        ...spendWhere(query, startAt, endAt),
        ...(organizationId ? { organizationId } : { workspaceId }),
      },
      select: {
        workspaceId: true,
        aiAgentId: true,
        agentModel: true,
        cachedInputTokens: true,
        channel: true,
        createdAt: true,
        credits: true,
        inputTokens: true,
        outputTokens: true,
        sessionId: true,
      },
    }),
    unscopedPrisma.creditLedgerEntry.findMany({
      where: {
        ...spendWhere(query, previousStartAt, startAt),
        ...(organizationId ? { organizationId } : { workspaceId }),
      },
      select: { credits: true },
    }),
  ]);

  const days = Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS);
  const daily = Array.from({ length: days }, (_, index) => ({
    date: new Date(startAt.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    ...emptyTotals(),
    sessionCount: 0,
  }));
  const totals = emptyTotals();
  const sessionIds = new Set<string>();
  const dailySessionIds = daily.map(() => new Set<string>());

  for (const row of spendRows) {
    addRow(totals, row);
    if (row.sessionId) sessionIds.add(row.sessionId);
    const dayIndex = Math.floor((row.createdAt.getTime() - startAt.getTime()) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) {
      addRow(daily[dayIndex], row);
      if (row.sessionId) dailySessionIds[dayIndex].add(row.sessionId);
    }
  }
  daily.forEach((day, index) => {
    day.sessionCount = dailySessionIds[index].size;
  });

  const byAgentTotals = groupBy(spendRows, (row) => row.aiAgentId);
  // Every AI Agent, not only those that spent: it also feeds the AI Agent filter.
  const agents = await unscopedPrisma.aiAgent.findMany({
    where: organizationId ? { workspace: { organizationId } } : { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  const byAgent: AiUsageAgentBreakdown[] = [...byAgentTotals.entries()].map(
    ([aiAgentId, agentTotals]) => ({
      aiAgentId,
      aiAgentName: agentNameById.get(aiAgentId) ?? "Deleted AI Agent",
      ...agentTotals,
    }),
  );
  const byModel: AiUsageModelBreakdown[] = [...groupBy(spendRows, (row) => row.agentModel)].map(
    ([agentModel, modelTotals]) => ({ agentModel, ...modelTotals }),
  );
  const byChannel: AiUsageChannelBreakdown[] = [...groupBy(spendRows, (row) => row.channel)].map(
    ([channel, channelTotals]) => ({ channel: channel as ChannelType, ...channelTotals }),
  );

  const workspaces = organizationId
    ? await unscopedPrisma.workspace.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      })
    : [];
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  const byWorkspace = [...groupBy(spendRows, (row) => row.workspaceId)].map(([id, usage]) => ({
    workspaceId: id,
    workspaceName: workspaceNames.get(id) ?? `Deleted Workspace (${id})`,
    ...usage,
  }));

  return {
    aiAgents: agents,
    balance,
    range: { from, to },
    totals: { ...totals, sessionCount: sessionIds.size },
    previousTotals: {
      creditsSpent: previousRows.reduce((sum, row) => sum - row.credits, 0),
      turnCount: previousRows.length,
    },
    daily,
    byAgent,
    byModel,
    byChannel,
    byWorkspace,
  };
}

/** The value below which `percent` of the sorted values fall (nearest rank). */
export function percentile(sortedValues: number[], percent: number) {
  if (!sortedValues.length) return 0;
  const rank = Math.ceil((percent / 100) * sortedValues.length);
  return sortedValues[Math.min(sortedValues.length, Math.max(rank, 1)) - 1];
}

/**
 * Tool calls in the range, per Tool and per day, read from the AI Activity
 * log. Tool calls spend no Credits of their own; they are here because they
 * explain what an AI Turn did.
 * ponytail: loads every Tool event in the range (≤92 days) and aggregates in
 * memory, because `metadata` is JSON. Move to SQL GROUP BY on real columns
 * if a Workspace's Tool volume makes this slow.
 */
export async function getToolUsage(query: AiUsageQuery = {}): Promise<AiUsageTools> {
  const { from, to, startAt, endAt } = resolveRange(query);
  const events = await prisma.aiActivity.findMany({
    select: { createdAt: true, eventType: true, metadata: true },
    where: {
      createdAt: { gte: startAt, lt: endAt },
      eventType: { in: ["TOOL_CALLED", "TOOL_FAILED"] },
      ...(query.aiAgentId || query.channel
        ? {
            ticket: {
              ...(query.aiAgentId ? { aiAgentId: query.aiAgentId } : {}),
              ...(query.channel ? { channel: { type: query.channel } } : {}),
            },
          }
        : {}),
    },
  });

  const days = Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS);
  const daily = Array.from({ length: days }, (_, index) => ({
    date: new Date(startAt.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    calls: 0,
    failed: 0,
  }));
  const byTool = new Map<string, { name: string; latencies: number[]; failed: number }>();
  const allLatencies: number[] = [];
  let failed = 0;

  for (const event of events) {
    const metadata = (event.metadata ?? {}) as {
      tool?: unknown;
      toolId?: unknown;
      latencyMs?: unknown;
    };
    const name = typeof metadata.tool === "string" ? metadata.tool : "Unknown Tool";
    const key = typeof metadata.toolId === "string" ? metadata.toolId : name;
    const latencyMs = Number(metadata.latencyMs ?? 0);
    const isFailure = event.eventType === "TOOL_FAILED";

    const tool = byTool.get(key) ?? { name, latencies: [], failed: 0 };
    tool.latencies.push(latencyMs);
    if (isFailure) tool.failed += 1;
    byTool.set(key, tool);

    allLatencies.push(latencyMs);
    if (isFailure) failed += 1;

    const dayIndex = Math.floor((event.createdAt.getTime() - startAt.getTime()) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) {
      daily[dayIndex].calls += 1;
      if (isFailure) daily[dayIndex].failed += 1;
    }
  }

  const summarize = (latencies: number[]) => {
    const sorted = [...latencies].sort((a, b) => a - b);
    return {
      avgLatencyMs: sorted.length
        ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
        : 0,
      p95LatencyMs: Math.round(percentile(sorted, 95)),
    };
  };

  return {
    range: { from, to },
    totals: { calls: events.length, failed, ...summarize(allLatencies) },
    daily,
    byTool: [...byTool.entries()].map(([toolId, tool]) => ({
      toolId,
      toolName: tool.name,
      calls: tool.latencies.length,
      failed: tool.failed,
      ...summarize(tool.latencies),
    })),
  };
}

/** Newest-first, cursor-paginated Credit Ledger for the Organization. */
export async function listCreditLedger({
  cursor,
  limit = ledgerListDefaultLimit,
}: ListCreditLedgerInput = {}): Promise<CreditLedgerPage> {
  const organizationId = await organizationIdForWorkspace(unscopedPrisma, requireWorkspaceId());
  const cursorEntry = cursor
    ? await unscopedPrisma.creditLedgerEntry.findFirst({
        where: { id: cursor, organizationId },
        select: { createdAt: true, id: true },
      })
    : null;

  if (cursor && !cursorEntry) {
    throw new InvalidLedgerCursorError();
  }

  const where = cursorEntry
    ? {
        OR: [
          { createdAt: { lt: cursorEntry.createdAt } },
          { createdAt: cursorEntry.createdAt, id: { lt: cursorEntry.id } },
        ],
      }
    : undefined;

  const [entries, total] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      where: { ...where, organizationId },
      select: {
        id: true,
        type: true,
        credits: true,
        note: true,
        aiAgentId: true,
        agentModel: true,
        channel: true,
        inputTokens: true,
        outputTokens: true,
        sessionId: true,
        ticketId: true,
        createdAt: true,
      },
    }),
    unscopedPrisma.creditLedgerEntry.count({ where: { organizationId } }),
  ]);

  const visible = entries.slice(0, limit);

  return {
    nextCursor: entries.length > limit ? (visible.at(-1)?.id ?? null) : null,
    entries: visible,
    total,
  };
}
