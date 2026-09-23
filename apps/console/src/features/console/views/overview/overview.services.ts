import { fetchOperatorOverview } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../../lib/api";
import type { OverviewRange } from "./overview.utils";

export function operatorOverviewQueryOptions(range: OverviewRange) {
  return queryOptions({
    queryKey: ["operator", "overview", range] as const,
    queryFn: () => fetchOperatorOverview(api, range),
    refetchInterval: 20_000,
  });
}
