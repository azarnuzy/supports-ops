import { createApiClient, fetchAiUsageSummary, fetchCreditLedger } from "@repo/api-client";

import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAiUsageSummary(range: DashboardRange) {
  return fetchAiUsageSummary(apiClient, range);
}

export function getCreditLedgerPage(params: { cursor?: string; limit?: number } = {}) {
  return fetchCreditLedger(apiClient, params);
}
