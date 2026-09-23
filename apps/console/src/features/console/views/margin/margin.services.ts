import { fetchOperatorMargin } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../../lib/api";
import type { OverviewRange } from "../overview/overview.utils";

export function operatorMarginQueryOptions(range: OverviewRange) {
  return queryOptions({
    queryKey: ["operator", "margin", range] as const,
    queryFn: () => fetchOperatorMargin(api, range),
  });
}
