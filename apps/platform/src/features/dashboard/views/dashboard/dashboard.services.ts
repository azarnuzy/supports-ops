import { createApiClient, fetchAnalyticsOverview, fetchAnalyticsTraffic } from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAnalyticsOverview() {
  return fetchAnalyticsOverview(apiClient);
}

export function getAnalyticsTraffic() {
  return fetchAnalyticsTraffic(apiClient);
}
