import { cn } from "@repo/ui/lib/utils";

import { StatusBadge, type TicketStatus } from "@repo/ui/components/ticket-badge";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { formatShare } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { StatusSpreadCardProps } from "./index.types";

const barClassByStatus: Record<TicketStatus, string> = {
  AI_HANDLING: "bg-status-ai",
  ESCALATED: "bg-status-escalated",
  HUMAN_HANDLING: "bg-status-human",
  RESOLVED: "bg-status-resolved",
};

export default function StatusSpreadCard({ counts }: StatusSpreadCardProps) {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <DashboardCard>
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base leading-5">Ticket statuses</CardTitle>
        <CardDescription className="leading-5">Current Ticket distribution.</CardDescription>
        <CardAction>
          <span className="text-xs tabular-nums text-muted-foreground">{total} Tickets</span>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {counts.map((entry) => (
          <div
            key={entry.status}
            className="-mx-2 flex items-center gap-2.5 px-2 py-2"
          >
            <div className="w-32 shrink-0">
              <StatusBadge status={entry.status} />
            </div>
            <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  barClassByStatus[entry.status],
                )}
                style={{ width: `${total === 0 ? 0 : (entry.count / total) * 100}%` }}
              />
            </div>
            <span className="w-7 text-right text-sm font-semibold tabular-nums">{entry.count}</span>
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {formatShare(entry.count, total)}
            </span>
          </div>
        ))}
      </CardContent>
    </DashboardCard>
  );
}
