import { GlobeIcon, MessageCircleIcon, type LucideIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { channelTypeLabels, formatShare } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { ChannelCardProps } from "./index.types";

const iconByChannelType: Record<string, LucideIcon> = {
  WEB: GlobeIcon,
  WHATSAPP: MessageCircleIcon,
};

export default function ChannelCard({ counts }: ChannelCardProps) {
  const total = counts.reduce((sum, channel) => sum + channel.ticketCount, 0);

  return (
    <DashboardCard>
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base leading-5">Tickets by Channel</CardTitle>
        <CardDescription className="leading-5">Ticket volume by configured Channel.</CardDescription>
        <CardAction>
          <span className="text-xs tabular-nums text-muted-foreground">{total} Tickets</span>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {counts.map((channel) => {
          const Icon = iconByChannelType[channel.channelType] ?? GlobeIcon;
          const share = total === 0 ? 0 : (channel.ticketCount / total) * 100;
          return (
            <div
              key={channel.channelId}
              className="-mx-2 flex items-center gap-3 px-2 py-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{channel.channelName}</span>
                    <Badge variant="outline" className="shrink-0 px-1.5 text-[11px]">
                      {channelTypeLabels[channel.channelType] ?? channel.channelType}
                    </Badge>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{channel.ticketCount}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatShare(channel.ticketCount, total)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </DashboardCard>
  );
}
