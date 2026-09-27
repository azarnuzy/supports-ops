import type { AiUsageDailyPoint } from "@repo/api-client";

export type DailyChartProps = {
  /** Daily Credits spent and distinct conversation counts, oldest first. */
  daily: AiUsageDailyPoint[];
};
