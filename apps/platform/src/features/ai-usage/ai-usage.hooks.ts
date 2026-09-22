import type { AiUsageFilters } from "@repo/api-client";
import { queryOptions, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../../lib/query-keys";
import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";
import {
  getAiToolUsage,
  getAiUsageSummary,
  getBilling,
  getCreditLedgerPage,
  startTopUpCheckout,
} from "./ai-usage.services";

export function aiUsageSummaryQueryOptions(range: DashboardRange, filters: AiUsageFilters = {}) {
  return queryOptions({
    queryFn: () => getAiUsageSummary(range, filters),
    queryKey: queryKeys.workspace.aiUsageSummary(range, filters),
  });
}

export function aiToolUsageQueryOptions(range: DashboardRange, filters: AiUsageFilters = {}) {
  return queryOptions({
    queryFn: () => getAiToolUsage(range, filters),
    queryKey: queryKeys.workspace.aiToolUsage(range, filters),
  });
}

/** Polls while a checkout is pending, so Credits appear once the Admin pays in the other tab. */
export const billingQueryOptions = queryOptions({
  queryFn: getBilling,
  queryKey: queryKeys.workspace.billing,
  refetchInterval: (query) =>
    query.state.data?.billing.payments.some((payment) => payment.status === "PENDING")
      ? 10_000
      : false,
});

export function useTopUpCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startTopUpCheckout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspace.billing }),
  });
}

export const creditLedgerPageSize = 20;

export function useCreditLedgerQuery(enabled: boolean) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (lastPage: Awaited<ReturnType<typeof getCreditLedgerPage>>) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      getCreditLedgerPage({ cursor: pageParam, limit: creditLedgerPageSize }),
    queryKey: queryKeys.workspace.creditLedger,
  });
}
