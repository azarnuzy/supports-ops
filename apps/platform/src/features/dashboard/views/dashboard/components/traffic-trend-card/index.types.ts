import type { AnalyticsDailyTrend } from "@repo/api-client";

export type TrafficTrendCardProps = {
  /** Daily created counts across the selected range, oldest first. */
  trends: AnalyticsDailyTrend[];
};
