import { queryOptions, useInfiniteQuery } from "@tanstack/react-query";

import { queryKeys } from "../../lib/query-keys";
import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";
import { getAiUsageSummary, getCreditLedgerPage } from "./ai-usage.services";

export function aiUsageSummaryQueryOptions(range: DashboardRange) {
  return queryOptions({
    queryFn: () => getAiUsageSummary(range),
    queryKey: queryKeys.workspace.aiUsageSummary(range),
  });
}

const creditLedgerPageSize = 20;

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
