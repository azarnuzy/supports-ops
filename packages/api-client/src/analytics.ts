import type { ApiClient } from "./client";
import type { TicketStatus } from "./tickets";

export type ResolutionFigure = { count: number; rate: number | null };
export type AnalyticsStatusCount = { status: TicketStatus; count: number };
export type ChannelType = "WEB" | "WHATSAPP";
export type AnalyticsChannelCount = {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  ticketCount: number;
};
export type AnalyticsRange = { from?: string; to?: string };
export type AnalyticsAgentStat = {
  humanAgentId: string;
  humanAgentName: string;
  /** Tickets currently in HUMAN_HANDLING with this assignee — point-in-time,
   * never filtered by the request's date range. */
  openTicketCount: number;
  /** Tickets whose Resolution names this Human Agent and whose resolvedAt
   * falls inside the range. */
  resolvedCount: number;
  /** Mean time from Ticket creation to the first Human Agent Message, over
   * Tickets created in the range and assigned to this agent; null when none
   * of them was ever answered by a human. */
  avgFirstResponseSeconds: number | null;
};

export type AnalyticsDailyTrend = {
  date: string;
  created: number;
  aiResolved: number;
  escalated: number;
};
export type AnalyticsOverview = {
  totalTickets: number;
  aiResolution: {
    customerConfirmed: ResolutionFigure;
    customerInactive: ResolutionFigure;
  };
  humanEscalation: ResolutionFigure;
  humanIdleClosure: {
    handled: ResolutionFigure;
    sharedQueue: ResolutionFigure;
  };
  statusCounts: AnalyticsStatusCount[];
  channelCounts: AnalyticsChannelCount[];
  range: { from: string; to: string };
  agentStats: AnalyticsAgentStat[];
  trends: AnalyticsDailyTrend[];
};

export async function fetchAnalyticsOverview(client: ApiClient, range?: AnalyticsRange) {
  const query = {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
  };
  const response = await client.analytics.overview.$get({ query });
  if (response.status === 403) throw new Error("Only an Admin can view Workspace analytics.");
  if (!response.ok) throw new Error("Failed to load analytics.");
  return (await response.json()) as { analytics: AnalyticsOverview };
}

export type AnalyticsHourBucket = { hourStart: string; count: number };
export type AnalyticsTraffic = {
  range: { from: string; to: string };
  traffic: AnalyticsHourBucket[];
  resolutions: AnalyticsHourBucket[];
};

export async function fetchAnalyticsTraffic(client: ApiClient, range?: AnalyticsRange) {
  const query = {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
  };
  const response = await client.analytics.traffic.$get({ query });
  if (response.status === 403) throw new Error("Only an Admin can view Workspace analytics.");
  if (!response.ok) throw new Error("Failed to load analytics.");
  return (await response.json()) as { analytics: AnalyticsTraffic };
}
