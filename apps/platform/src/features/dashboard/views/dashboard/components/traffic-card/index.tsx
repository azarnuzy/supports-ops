import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";

import HeatmapGrid from "../heatmap-grid";
import DashboardCard from "../dashboard-card";
import type { TrafficCardProps } from "./index.types";

export default function TrafficCard({
  title,
  description,
  buckets,
  metricLabel,
  timeZone,
}: TrafficCardProps) {
  return (
    <DashboardCard className="py-3.5">
      <CardHeader className="gap-1.5 px-3 sm:px-6">
        <CardTitle className="text-sm leading-4">{title}</CardTitle>
        <CardDescription className="text-xs leading-4">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <HeatmapGrid buckets={buckets} metricLabel={metricLabel} timeZone={timeZone} />
      </CardContent>
    </DashboardCard>
  );
}
