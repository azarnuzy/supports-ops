import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../../../../lib/query-keys";
import {
  getAnalyticsOverview,
  getAnalyticsTraffic,
  getRecentConversations,
} from "./dashboard.services";
import type { DashboardRange } from "./dashboard.utils";

export function analyticsOverviewQueryOptions(range: DashboardRange) {
  return queryOptions({
    queryFn: () => getAnalyticsOverview(range),
    queryKey: queryKeys.workspace.analytics(range),
    refetchInterval: 20_000,
  });
}

export function analyticsTrafficQueryOptions(range: DashboardRange) {
  return queryOptions({
    queryFn: () => getAnalyticsTraffic(range),
    queryKey: queryKeys.workspace.analyticsTraffic(range),
    refetchInterval: 60_000,
  });
}

export const recentConversationsQueryOptions = queryOptions({
  queryFn: getRecentConversations,
  queryKey: queryKeys.workspace.recentConversations,
  refetchInterval: 20_000,
});
