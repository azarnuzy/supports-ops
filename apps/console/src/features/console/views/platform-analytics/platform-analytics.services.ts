import { fetchPlatformAnalyticsTrends } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import type { ConsoleDateRange } from "../../components/date-range-picker";
import { api } from "../../../../lib/api";

export function platformAnalyticsTrendsQueryOptions(range: ConsoleDateRange) {
  return queryOptions({
    queryKey: ["operator", "analytics", "trends", range] as const,
    queryFn: () => fetchPlatformAnalyticsTrends(api, range),
  });
}
