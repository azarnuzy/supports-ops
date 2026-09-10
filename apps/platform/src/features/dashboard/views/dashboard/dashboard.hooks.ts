import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../../../lib/query-keys";
import { getAnalyticsOverview, getAnalyticsTraffic } from "./dashboard.services";

export const analyticsOverviewQueryOptions = queryOptions({
  queryFn: getAnalyticsOverview,
  queryKey: queryKeys.workspace.analytics,
  refetchInterval: 20_000,
});

export const analyticsTrafficQueryOptions = queryOptions({
  queryFn: getAnalyticsTraffic,
  queryKey: queryKeys.workspace.analyticsTraffic,
  refetchInterval: 60_000,
});
