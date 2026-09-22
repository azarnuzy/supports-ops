import type { ChannelType, CreditLedgerEntryType } from "@prisma/client";
import type { AnalyticsDateRange } from "../analytics/types";

export type UsageTotals = {
  creditsSpent: number;
  turnCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type AiUsageDailyPoint = UsageTotals & { date: string };

export type AiUsageAgentBreakdown = UsageTotals & { aiAgentId: string; aiAgentName: string };

export type AiUsageModelBreakdown = UsageTotals & { agentModel: string };

export type AiUsageChannelBreakdown = UsageTotals & { channel: ChannelType };

export type AiUsageSummary = {
  aiAgents: { id: string; name: string }[];
  balance: number;
  range: AnalyticsDateRange;
  totals: UsageTotals & { sessionCount: number };
  /** The equally long period right before `range`, for change indicators. */
  previousTotals: { creditsSpent: number; turnCount: number };
  daily: AiUsageDailyPoint[];
  byAgent: AiUsageAgentBreakdown[];
  byModel: AiUsageModelBreakdown[];
  byChannel: AiUsageChannelBreakdown[];
};

export type ToolLatency = { avgLatencyMs: number; p95LatencyMs: number };

export type AiUsageTools = {
  range: AnalyticsDateRange;
  totals: ToolLatency & { calls: number; failed: number };
  daily: { date: string; calls: number; failed: number }[];
  byTool: (ToolLatency & { toolId: string; toolName: string; calls: number; failed: number })[];
};

/** Deliberately excludes `modelRate` and `providerCostUsd` — AI Usage never
 * exposes provider cost. Tokens are informational only. */
export type CreditLedgerEntryItem = {
  id: string;
  type: CreditLedgerEntryType;
  credits: number;
  note: string | null;
  aiAgentId: string | null;
  agentModel: string | null;
  channel: ChannelType | null;
  inputTokens: number | null;
  outputTokens: number | null;
  sessionId: string | null;
  ticketId: string | null;
  createdAt: Date;
};

export type CreditLedgerPage = {
  entries: CreditLedgerEntryItem[];
  nextCursor: string | null;
  /** All entries in the Workspace, for the page count. */
  total: number;
};
