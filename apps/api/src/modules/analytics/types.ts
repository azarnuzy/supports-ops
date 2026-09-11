import type { ChannelType, TicketStatus } from "@prisma/client";

export type ResolutionFigure = { count: number; rate: number | null };

export type AnalyticsStatusCount = { status: TicketStatus; count: number };

export type AnalyticsChannelCount = {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  ticketCount: number;
};

export type AnalyticsAgentLoad = {
  humanAgentId: string;
  humanAgentName: string;
  activeTicketCount: number;
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
  activeTicketsPerHumanAgent: AnalyticsAgentLoad[];
};

export type AnalyticsOverviewResponse = { analytics: AnalyticsOverview };

export type AnalyticsHourBucket = { hourStart: string; count: number };

export type AnalyticsTraffic = {
  traffic: AnalyticsHourBucket[];
  resolutions: AnalyticsHourBucket[];
};

export type AnalyticsTrafficResponse = { analytics: AnalyticsTraffic };
