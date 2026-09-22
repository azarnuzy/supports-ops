import {
  createApiClient,
  createTopUpCheckout,
  fetchAiToolUsage,
  fetchAiUsageSummary,
  fetchBilling,
  fetchCreditLedger,
  type AiUsageFilters,
} from "@repo/api-client";

import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAiUsageSummary(range: DashboardRange, filters?: AiUsageFilters) {
  return fetchAiUsageSummary(apiClient, range, filters);
}

export function getAiToolUsage(range: DashboardRange, filters?: AiUsageFilters) {
  return fetchAiToolUsage(apiClient, range, filters);
}

export function getCreditLedgerPage(params: { cursor?: string; limit?: number } = {}) {
  return fetchCreditLedger(apiClient, params);
}

export function getBilling() {
  return fetchBilling(apiClient);
}

export function startTopUpCheckout(packId: string) {
  return createTopUpCheckout(apiClient, packId);
}
