import { CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";

import DashboardCard from "../dashboard-card";
import Donut, { type DonutSlice } from "../donut";
import type { ChannelCardProps } from "./index.types";

/** Brand-first palette: Web Widget reads as primary blue, WhatsApp as the
 * resolved green from the reference, then the remaining product hues. */
const sliceColors = [
  "var(--primary)",
  "var(--status-resolved)",
  "var(--status-escalated)",
  "var(--status-human)",
  "var(--chart-2)",
  "var(--chart-4)",
];

export default function ChannelCard({ counts }: ChannelCardProps) {
  const slices: DonutSlice[] = counts
    .filter((channel) => channel.ticketCount > 0)
    .map((channel, index) => ({
      key: channel.channelId,
      label: channel.channelName,
      color: sliceColors[index % sliceColors.length],
      value: channel.ticketCount,
    }));

  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="text-sm leading-4">Tickets by Channel</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center px-3.5">
        {slices.length > 0 ? (
          <Donut slices={slices} />
        ) : (
          <div className="flex h-32 w-full items-center justify-center text-xs text-muted-foreground">
            No Tickets in this range.
          </div>
        )}
      </CardContent>
    </DashboardCard>
  );
}
