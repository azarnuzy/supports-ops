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
}: TrafficCardProps) {
  return (
    <DashboardCard>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <LiveBadge />
        </CardAction>
      </CardHeader>
      <CardContent>
        <HeatmapGrid buckets={buckets} metricLabel={metricLabel} />
      </CardContent>
    </DashboardCard>
  );
}
