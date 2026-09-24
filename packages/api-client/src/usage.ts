import type { AnalyticsRange } from "./analytics";
import type { ApiClient } from "./client";

export type UsageTotals = {
  creditsSpent: number;
  turnCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};
export type UsageChannel = "WEB" | "WHATSAPP";
export type AiUsageDailyPoint = UsageTotals & { date: string };
export type AiUsageAgentBreakdown = UsageTotals & { aiAgentId: string; aiAgentName: string };
export type AiUsageModelBreakdown = UsageTotals & { agentModel: string };
export type AiUsageChannelBreakdown = UsageTotals & { channel: UsageChannel };

export type AiUsageSummary = {
  aiAgents: { id: string; name: string }[];
  balance: number;
  range: { from: string; to: string };
  totals: UsageTotals & { sessionCount: number };
  previousTotals: { creditsSpent: number; turnCount: number };
  daily: AiUsageDailyPoint[];
  byAgent: AiUsageAgentBreakdown[];
  byModel: AiUsageModelBreakdown[];
  byChannel: AiUsageChannelBreakdown[];
};

export type AiUsageFilters = { aiAgentId?: string; channel?: UsageChannel };

function aiUsageQuery(range?: AnalyticsRange, filters: AiUsageFilters = {}) {
  return {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
    ...(filters.aiAgentId ? { aiAgentId: filters.aiAgentId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
  };
}

export async function fetchAiUsageSummary(
  client: ApiClient,
  range?: AnalyticsRange,
  filters?: AiUsageFilters,
) {
  const response = await client["ai-usage"].summary.$get({ query: aiUsageQuery(range, filters) });
  if (response.status === 403) throw new Error("Only an Admin can view AI Usage.");
  if (!response.ok) throw new Error("Failed to load AI Usage.");
  return (await response.json()) as { aiUsage: AiUsageSummary };
}

export type ToolLatency = { avgLatencyMs: number; p95LatencyMs: number };
export type AiToolUsage = {
  range: { from: string; to: string };
  totals: ToolLatency & { calls: number; failed: number };
  daily: { date: string; calls: number; failed: number }[];
  byTool: (ToolLatency & { toolId: string; toolName: string; calls: number; failed: number })[];
};

export async function fetchAiToolUsage(
  client: ApiClient,
  range?: AnalyticsRange,
  filters?: AiUsageFilters,
) {
  const response = await client["ai-usage"].tools.$get({ query: aiUsageQuery(range, filters) });
  if (response.status === 403) throw new Error("Only an Admin can view AI Usage.");
  if (!response.ok) throw new Error("Failed to load Tool usage.");
  return (await response.json()) as { toolUsage: AiToolUsage };
}
