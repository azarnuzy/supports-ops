import { createApiClient, fetchAnalyticsOverview } from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAnalyticsOverview() {
  return fetchAnalyticsOverview(apiClient);
}
