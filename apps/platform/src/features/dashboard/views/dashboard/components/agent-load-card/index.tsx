import { InboxIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import DashboardCard from "../dashboard-card";
import type { AgentLoadCardProps } from "./index.types";

export default function AgentLoadCard({ loads }: AgentLoadCardProps) {
  const sorted = [...loads].sort((a, b) => b.activeTicketCount - a.activeTicketCount);
  const max = Math.max(0, ...loads.map((load) => load.activeTicketCount));
  const total = loads.reduce((sum, load) => sum + load.activeTicketCount, 0);

  return (
    <DashboardCard>
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base leading-5">Active Tickets per Human Agent</CardTitle>
        <CardDescription className="leading-5">Current human-handled workload.</CardDescription>
        <CardAction>
          <span className="text-xs tabular-nums text-muted-foreground">{total} Tickets</span>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {sorted.length > 0 ? (
          sorted.map((load, index) => {
            const initials = load.humanAgentName
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word.charAt(0).toUpperCase())
              .join("");
            return (
              <div key={load.humanAgentId} className="-mx-2 flex items-center gap-3 px-2 py-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Avatar>
                  <AvatarFallback className="text-xs font-semibold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{load.humanAgentName}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {load.activeTicketCount}
                    </span>
                  </div>
                  <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{
                        width: `${max === 0 ? 0 : (load.activeTicketCount / max) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <InboxIcon className="size-4 shrink-0" />
            No active human-handled Tickets.
          </div>
        )}
      </CardContent>
    </DashboardCard>
  );
}
