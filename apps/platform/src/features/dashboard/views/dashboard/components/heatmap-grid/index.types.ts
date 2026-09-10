import type { AnalyticsHourBucket } from "@repo/api-client";

export type HeatmapGridProps = {
  buckets: AnalyticsHourBucket[];
  /** Metric name shown in cell tooltips and the selection panel. */
  metricLabel: string;
  timeZone: string;
};
