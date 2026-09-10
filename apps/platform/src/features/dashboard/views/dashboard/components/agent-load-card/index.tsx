import { InboxIcon } from "lucide-react";

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
      <CardHeader>
        <CardTitle>Active Tickets per Human Agent</CardTitle>
        <CardDescription>Who is holding human-handled work right now.</CardDescription>
        <CardAction>
          <span className="text-xs tabular-nums text-muted-foreground">{total} active</span>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1">
        {sorted.length > 0 ? (
          sorted.map((load, index) => {
            const initials = load.humanAgentName
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word.charAt(0).toUpperCase())
              .join("");
            return (
              <div
                key={load.humanAgentId}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/50"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {initials}
                </span>
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
