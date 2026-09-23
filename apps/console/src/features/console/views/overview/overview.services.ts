import { fetchOperatorOverview } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import type { ConsoleDateRange } from "../../components/date-range-picker";
import { api } from "../../../../lib/api";

export function operatorOverviewQueryOptions(range: ConsoleDateRange) {
  return queryOptions({
    queryKey: ["operator", "overview", range] as const,
    queryFn: () => fetchOperatorOverview(api, range),
    refetchInterval: 20_000,
  });
}
