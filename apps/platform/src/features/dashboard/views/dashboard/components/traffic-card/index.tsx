import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import HeatmapGrid from "../heatmap-grid";
import DashboardCard from "../dashboard-card";

import LiveBadge from "../live-badge";
import type { TrafficCardProps } from "./index.types";

export default function TrafficCard({
  title,
  description,
  buckets,
  metricLabel,
  timeZone,
}: TrafficCardProps) {
  return (
    <DashboardCard>
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base leading-5">{title}</CardTitle>
        <CardDescription className="leading-5">{description}</CardDescription>
        <CardAction>
          <LiveBadge />
        </CardAction>
      </CardHeader>
      <CardContent>
        <HeatmapGrid buckets={buckets} metricLabel={metricLabel} timeZone={timeZone} />
      </CardContent>
    </DashboardCard>
  );
}
