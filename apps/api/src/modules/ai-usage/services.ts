import { creditBalance } from "../credits/services";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { resolveRange } from "../analytics/services";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { ledgerListDefaultLimit } from "./schema";
import type {
  AiUsageAgentBreakdown,
  AiUsageModelBreakdown,
  AiUsageSummary,
  CreditLedgerPage,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ListCreditLedgerInput = { cursor?: string; limit?: number };

export class InvalidLedgerCursorError extends Error {}

/**
 * Balance, a zero-filled daily series, and totals by AI Agent and Agent
 * Model, all from the Credit Ledger's SPEND entries — never Telemetry.
 * Everything but the balance is scoped to the requested date range.
 */
export async function getAiUsageSummary(query: AnalyticsRangeQuery = {}): Promise<AiUsageSummary> {
  const workspaceId = requireWorkspaceId();
  const { from, to, startAt, endAt } = resolveRange(query);

  const [balance, spendRows] = await Promise.all([
    creditBalance(workspaceId),
    prisma.creditLedgerEntry.findMany({
      where: { type: "SPEND", createdAt: { gte: startAt, lt: endAt } },
      select: { credits: true, createdAt: true, aiAgentId: true, agentModel: true },
    }),
  ]);

  const days = Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS);
  const daily = Array.from({ length: days }, (_, index) => ({
    date: new Date(startAt.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    creditsSpent: 0,
    turnCount: 0,
  }));

  const byAgentTotals = new Map<string, { creditsSpent: number; turnCount: number }>();
  const byModelTotals = new Map<string, { creditsSpent: number; turnCount: number }>();

  for (const row of spendRows) {
    const creditsSpent = -row.credits;

    const dayIndex = Math.floor((row.createdAt.getTime() - startAt.getTime()) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) {
      daily[dayIndex].creditsSpent += creditsSpent;
      daily[dayIndex].turnCount += 1;
    }

    if (row.aiAgentId) {
      const totals = byAgentTotals.get(row.aiAgentId) ?? { creditsSpent: 0, turnCount: 0 };
      totals.creditsSpent += creditsSpent;
      totals.turnCount += 1;
      byAgentTotals.set(row.aiAgentId, totals);
    }

    if (row.agentModel) {
      const totals = byModelTotals.get(row.agentModel) ?? { creditsSpent: 0, turnCount: 0 };
      totals.creditsSpent += creditsSpent;
      totals.turnCount += 1;
      byModelTotals.set(row.agentModel, totals);
    }
  }

  const agents = byAgentTotals.size
    ? await prisma.aiAgent.findMany({
        where: { id: { in: [...byAgentTotals.keys()] } },
        select: { id: true, name: true },
      })
    : [];
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  const byAgent: AiUsageAgentBreakdown[] = [...byAgentTotals.entries()].map(
    ([aiAgentId, totals]) => ({
      aiAgentId,
      aiAgentName: agentNameById.get(aiAgentId) ?? "Deleted AI Agent",
      ...totals,
    }),
  );

  const byModel: AiUsageModelBreakdown[] = [...byModelTotals.entries()].map(
    ([agentModel, totals]) => ({ agentModel, ...totals }),
  );

  return { balance, range: { from, to }, daily, byAgent, byModel };
}

/** Newest-first, cursor-paginated Credit Ledger — every Trial Grant, Top-Up,
 * and spend the Workspace has ever recorded. */
export async function listCreditLedger({
  cursor,
  limit = ledgerListDefaultLimit,
}: ListCreditLedgerInput = {}): Promise<CreditLedgerPage> {
  const cursorEntry = cursor
    ? await prisma.creditLedgerEntry.findUnique({
        where: { id: cursor },
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

  const entries = await prisma.creditLedgerEntry.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    where,
    select: {
      id: true,
      type: true,
      credits: true,
      note: true,
      aiAgentId: true,
      agentModel: true,
      sessionId: true,
      ticketId: true,
      createdAt: true,
    },
  });

  const visible = entries.slice(0, limit);

  return {
    nextCursor: entries.length > limit ? (visible.at(-1)?.id ?? null) : null,
    entries: visible,
  };
}
