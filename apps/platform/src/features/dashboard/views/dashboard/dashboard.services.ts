import {
  createApiClient,
  fetchAnalyticsOverview,
  fetchAnalyticsTraffic,
  listConversations,
} from "@repo/api-client";

import type { DashboardRange } from "./dashboard.utils";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAnalyticsOverview(range: DashboardRange) {
  return fetchAnalyticsOverview(apiClient, range);
}

export function getAnalyticsTraffic(range: DashboardRange) {
  return fetchAnalyticsTraffic(apiClient, range);
}

export function getRecentConversations() {
  return listConversations(apiClient, { limit: 5 });
}
