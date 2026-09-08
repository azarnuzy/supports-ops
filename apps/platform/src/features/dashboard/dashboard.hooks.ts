import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { getAnalyticsOverview } from "./dashboard.services";

export const analyticsOverviewQueryOptions = queryOptions({
  queryFn: getAnalyticsOverview,
  queryKey: queryKeys.workspace.analytics,
});
