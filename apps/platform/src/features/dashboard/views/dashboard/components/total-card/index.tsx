import { InfoIcon, InboxIcon } from "lucide-react";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";

import DashboardCard from "../dashboard-card";
import type { TotalCardProps } from "./index.types";

export default function TotalCard({ totalTickets }: TotalCardProps) {
  return (
    <DashboardCard>
      <CardHeader className="gap-4">
        <div className="flex min-h-10 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <InboxIcon className="size-4" />
          </span>
          <CardDescription className="text-sm font-medium leading-5 text-foreground">
            Total Tickets
          </CardDescription>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About Total Tickets"
                className="ml-auto cursor-help rounded-full p-1 text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Every Ticket created in this Workspace, across all statuses and Channels. All rates
              beside it use this count as their denominator.
            </TooltipContent>
          </Tooltip>
        </div>
        <CardTitle className="text-4xl leading-none tabular-nums tracking-tight">
          {totalTickets}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-auto grid gap-3">
        <div aria-hidden className="h-1.5 rounded-full bg-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          100% of Workspace Tickets · rate denominator.
        </p>
      </CardContent>
    </DashboardCard>
  );
}
