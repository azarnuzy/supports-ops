import type { AiUsageDailyPoint } from "@repo/api-client";

export type DailyChartProps = {
  /** Daily Credits-spent and AI Turn counts across the selected range, oldest first. */
  daily: AiUsageDailyPoint[];
};
