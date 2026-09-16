import type { ChannelType, TicketStatus } from "@prisma/client";

export type ResolutionFigure = { count: number; rate: number | null };

export type AnalyticsStatusCount = { status: TicketStatus; count: number };

export type AnalyticsChannelCount = {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  ticketCount: number;
};

export type AnalyticsDailyTrend = {
  date: string;
  created: number;
  aiResolved: number;
  escalated: number;
};

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

/** The normalized inclusive UTC calendar dates (YYYY-MM-DD) backing one
 * analytics response. */
export type AnalyticsDateRange = { from: string; to: string };

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
  range: AnalyticsDateRange;
  agentStats: AnalyticsAgentStat[];
  trends: AnalyticsDailyTrend[];
};

export type AnalyticsOverviewResponse = { analytics: AnalyticsOverview };

export type AnalyticsHourBucket = { hourStart: string; count: number };

export type AnalyticsTraffic = {
  range: AnalyticsDateRange;
  traffic: AnalyticsHourBucket[];
  resolutions: AnalyticsHourBucket[];
};

export type AnalyticsTrafficResponse = { analytics: AnalyticsTraffic };
