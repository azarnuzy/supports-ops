import { fetchOperatorMargin } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import type { ConsoleDateRange } from "../../components/date-range-picker";
import { api } from "../../../../lib/api";

export function operatorMarginQueryOptions(range: ConsoleDateRange) {
  return queryOptions({
    queryKey: ["operator", "margin", range] as const,
    queryFn: () => fetchOperatorMargin(api, range),
  });
}
