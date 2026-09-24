import type { AnalyticsOverview, AnalyticsRange, AnalyticsTraffic, ChannelType } from "./analytics";
import { UnauthorizedApiError } from "./auth";
import type { UnlimitedPeriod } from "./billing";
import type { ApiClient } from "./client";
import type { AiToolUsage, AiUsageSummary } from "./usage";

export type OperatorTicketStatus = "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
export type OperatorResolutionReason =
  | "HUMAN_RESOLVED"
  | "CUSTOMER_CONFIRMED"
  | "CUSTOMER_INACTIVE"
  | "CUSTOMER_INACTIVE_HUMAN_HANDLING"
  | "CUSTOMER_INACTIVE_SHARED_QUEUE";

export type OperatorOverview = {
  range: { from: string; to: string };
  workspaces: { total: number; active: number; new: number };
  previous: {
    activeWorkspaces: number;
    newWorkspaces: number;
    sessions: number;
    creditsSpent: number;
    revenueIdr: number;
    providerCostUsd: number;
  };
  topWorkspaces: { id: string; name: string; sessions: number; previousSessions: number }[];
  sessions: Record<ChannelType, number>;
  tickets: {
    byStatus: Partial<Record<OperatorTicketStatus, number>>;
    byResolutionReason: Record<OperatorResolutionReason, number>;
    resolvedByReason: Record<OperatorResolutionReason, number>;
  };
  credits: { spent: number; topUps: number; trialGrants: number };
  revenueIdr: number;
  providerCostUsd: number;
};

export async function fetchOperatorOverview(client: ApiClient, range?: AnalyticsRange) {
  const query = {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
  };
  const response = await client.operator.overview.$get({ query });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load the Operator overview.");
  return (await response.json()) as { overview: OperatorOverview };
}

export type OperatorModelMargin = {
  agentModel: string;
  aiTurns: number;
  unlimitedTurns: number;
  creditsCharged: number;
  providerCostUsd: number;
  usdPerCredit: number | null;
};

export type OperatorMargin = {
  range: { from: string; to: string };
  models: OperatorModelMargin[];
};

export async function fetchOperatorMargin(client: ApiClient, range?: AnalyticsRange) {
  const query = {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
  };
  const response = await client.operator.margin.$get({ query });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load the Model margin.");
  return (await response.json()) as OperatorMargin;
}

export type PlatformAnalyticsTrends = {
  range: { from: string; to: string };
  sessions: { date: string; count: number }[];
  tickets: { date: string; created: number; aiResolved: number; escalated: number }[];
  aiEffectiveness: { count: number; total: number; rate: number | null };
};

export async function fetchPlatformAnalyticsTrends(client: ApiClient, range?: AnalyticsRange) {
  const query = {
    ...(range?.from ? { from: range.from } : {}),
    ...(range?.to ? { to: range.to } : {}),
  };
  const response = await client.operator.analytics.trends.$get({ query });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load Platform Analytics trends.");
  return (await response.json()) as PlatformAnalyticsTrends;
}

export type OperatorAttentionCondition =
  | "CREDIT_EXHAUSTED"
  | "LOW_BALANCE"
  | "UNLIMITED_ENDING_SOON"
  | "INACTIVE";

export type OperatorWorkspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  userCount: number;
  adminName: string | null;
  adminCount: number;
  balance: number;
  activeUnlimitedPeriod: { endAt: string | null } | null;
  lastCustomerActivityAt: string | null;
  conditions: OperatorAttentionCondition[];
  channels: ChannelType[];
  sessionCount: number;
  previousSessionCount: number;
  creditsUsed: number;
  previousCreditsUsed: number;
};

export async function fetchOperatorWorkspaces(
  client: ApiClient,
  params: {
    search?: string;
    page?: number;
    limit?: number;
    sortBy?:
      | "createdAt"
      | "name"
      | "userCount"
      | "balance"
      | "unlimitedEndAt"
      | "lastCustomerActivityAt"
      | "sessionCount"
      | "creditsUsed";
    sortDirection?: "asc" | "desc";
    attention?: OperatorAttentionCondition;
    status?: "HEALTHY" | "NEEDS_ATTENTION";
    channel?: ChannelType;
    from?: string;
    to?: string;
  } = {},
) {
  const response = await client.operator.workspaces.$get({
    query: {
      ...(params.search ? { search: params.search } : {}),
      ...(params.page ? { page: String(params.page) } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortDirection ? { sortDirection: params.sortDirection } : {}),
      ...(params.attention ? { attention: params.attention } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
    },
  });
  if (!response.ok) throw new Error("Failed to load Workspaces.");
  return (await response.json()) as {
    workspaces: OperatorWorkspace[];
    total: number;
    page: number;
    limit: number;
    channelCounts: Record<ChannelType, number>;
  };
}

export type OperatorWorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "HUMAN_AGENT";
  lastSignInAt: string | null;
};

export type OperatorWorkspaceDetail = {
  workspace: { id: string; name: string; slug: string; createdAt: string };
  attention: {
    balance: number;
    activeUnlimitedPeriod: { endAt: string | null } | null;
    lastCustomerActivityAt: string | null;
    conditions: ("CREDIT_EXHAUSTED" | "LOW_BALANCE" | "UNLIMITED_ENDING_SOON" | "INACTIVE")[];
  };
  sessions: { count: number; previousCount: number; daily: { date: string; count: number }[] };
  outcomes: { reason: OperatorResolutionReason; count: number }[];
  billing: {
    toppedUpThisMonth: number;
    spentThisMonth: number;
    lastPayment: { id: string; paidAt: string | null; credits: number; amountIdr: number } | null;
  };
  unlimitedPeriod: UnlimitedPeriod | null;
  users: OperatorWorkspaceUser[];
  channels: { webWidgetActive: boolean; whatsAppConnected: boolean };
  knowledgeSources: { status: string; count: number }[];
  aiAgents: { id: string; name: string; status: "ACTIVE" | "INACTIVE"; agentModel: string }[];
  analytics: { overview: AnalyticsOverview; traffic: AnalyticsTraffic };
  aiUsage: { summary: AiUsageSummary; tools: AiToolUsage };
};

export async function fetchOperatorWorkspaceDetail(
  client: ApiClient,
  workspaceId: string,
  range?: AnalyticsRange,
) {
  const response = await client.operator.workspaces[":id"].$get({
    param: { id: workspaceId },
    query: {
      ...(range?.from ? { from: range.from } : {}),
      ...(range?.to ? { to: range.to } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Failed to load the Workspace.");
  const detail = (await response.json()) as OperatorWorkspaceDetail;
  if (!detail.attention || !detail.sessions || !detail.billing || !detail.outcomes)
    throw new Error("Workspace detail data is out of date. Restart the API server and try again.");
  return detail;
}

export async function grantUnlimitedPeriod(
  client: ApiClient,
  workspaceId: string,
  endDate: string | null,
) {
  const response = await client.operator.workspaces[":workspaceId"]["unlimited-period"].$post({
    param: { workspaceId },
    json: { endDate },
  });
  if (response.status === 404) throw new Error("Workspace not found.");
  if (response.status === 409)
    throw new Error("This Workspace already has an active Unlimited Period.");
  if (!response.ok) throw new Error("Failed to grant the Unlimited Period.");
  return (await response.json()) as { period: UnlimitedPeriod };
}

export async function extendUnlimitedPeriod(
  client: ApiClient,
  workspaceId: string,
  endDate: string | null,
) {
  const response = await client.operator.workspaces[":workspaceId"]["unlimited-period"].$patch({
    param: { workspaceId },
    json: { endDate },
  });
  if (response.status === 404) throw new Error("This Workspace has no active Unlimited Period.");
  if (!response.ok) throw new Error("Failed to extend the Unlimited Period.");
  return (await response.json()) as { period: UnlimitedPeriod };
}

export async function endUnlimitedPeriodEarly(client: ApiClient, workspaceId: string) {
  const response = await client.operator.workspaces[":workspaceId"]["unlimited-period"].end.$post({
    param: { workspaceId },
  });
  if (response.status === 404) throw new Error("This Workspace has no active Unlimited Period.");
  if (!response.ok) throw new Error("Failed to end the Unlimited Period.");
  return (await response.json()) as { period: UnlimitedPeriod };
}

export type OperatorActionType =
  | "TOP_UP"
  | "UNLIMITED_PERIOD_GRANTED"
  | "UNLIMITED_PERIOD_EXTENDED"
  | "UNLIMITED_PERIOD_ENDED";

export type OperatorAction = {
  id: string;
  type: OperatorActionType;
  workspaceId: string;
  workspace: { id: string; name: string } | null;
  payload: Record<string, unknown>;
  createdAt: string;
  operator: { id: string; name: string; email: string };
};

export async function fetchOperatorActions(
  client: ApiClient,
  params: { workspaceId?: string } = {},
) {
  const response = await client.operator.actions.$get({
    query: { ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}) },
  });
  if (!response.ok) throw new Error("Failed to load the Action log.");
  return (await response.json()) as { actions: OperatorAction[] };
}

export type TopUpInput = { credits: number; note: string };
export type TopUpResult = {
  action: {
    id: string;
    operatorId: string;
    workspaceId: string;
    type: "TOP_UP";
    payload: unknown;
    createdAt: string;
  };
  balance: number;
};

export async function topUpWorkspace(client: ApiClient, workspaceId: string, input: TopUpInput) {
  const response = await client.operator.workspaces[":workspaceId"]["top-ups"].$post({
    param: { workspaceId },
    json: input,
  });
  if (response.status === 404) throw new Error("This Workspace no longer exists.");
  if (!response.ok) throw new Error("Failed to record the Top-Up.");
  return (await response.json()) as TopUpResult;
}
