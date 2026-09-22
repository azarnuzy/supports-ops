import type { CreditLedgerEntryType } from "@prisma/client";
import type { AnalyticsDateRange } from "../analytics/types";

export type AiUsageDailyPoint = { date: string; creditsSpent: number; turnCount: number };

export type AiUsageAgentBreakdown = {
  aiAgentId: string;
  aiAgentName: string;
  creditsSpent: number;
  turnCount: number;
};

export type AiUsageModelBreakdown = { agentModel: string; creditsSpent: number; turnCount: number };

export type AiUsageSummary = {
  balance: number;
  range: AnalyticsDateRange;
  daily: AiUsageDailyPoint[];
  byAgent: AiUsageAgentBreakdown[];
  byModel: AiUsageModelBreakdown[];
};

/** Deliberately excludes `modelRate` and `providerCostUsd` — AI Usage never
 * exposes provider cost. */
export type CreditLedgerEntryItem = {
  id: string;
  type: CreditLedgerEntryType;
  credits: number;
  note: string | null;
  aiAgentId: string | null;
  agentModel: string | null;
  sessionId: string | null;
  ticketId: string | null;
  createdAt: Date;
};

export type CreditLedgerPage = { entries: CreditLedgerEntryItem[]; nextCursor: string | null };
