import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { channelTypeLabels } from "../../dashboard.utils";
import type { ChannelCardProps } from "./index.types";

export default function ChannelCard({ counts }: ChannelCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets by Channel</CardTitle>
        <CardDescription>Where conversations arrive.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {counts.map((channel) => (
          <div key={channel.channelId} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {channel.channelName}
              <Badge variant="outline">
                {channelTypeLabels[channel.channelType] ?? channel.channelType}
              </Badge>
            </span>
            <span className="text-sm font-medium tabular-nums">{channel.ticketCount}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
