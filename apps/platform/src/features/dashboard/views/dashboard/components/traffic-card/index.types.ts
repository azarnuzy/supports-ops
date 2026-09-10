import type { AnalyticsHourBucket } from "@repo/api-client";

export type TrafficCardProps = {
  title: string;
  description: string;
  buckets: AnalyticsHourBucket[];
  /** Metric name surfaced by the heatmap tooltips and selection panel. */
  metricLabel: string;
};
