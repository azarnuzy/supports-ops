import { InfoIcon } from "lucide-react";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";

import { formatRate } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { RateCardProps } from "./index.types";

export default function RateCard({
  icon: Icon,
  title,
  info,
  hint,
  figure,
  totalTickets,
}: RateCardProps) {
  const ratePercent = figure.rate === null ? 0 : Math.min(100, figure.rate * 100);

  return (
    <DashboardCard>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <CardDescription className="font-medium text-balance">{title}</CardDescription>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${title}`}
                className="ml-auto rounded-full p-1 text-muted-foreground/70 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{info}</TooltipContent>
          </Tooltip>
        </div>
        <CardTitle className="text-4xl tabular-nums tracking-tight">
          {formatRate(figure.rate)}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${ratePercent}%` }}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {totalTickets === 0 ? (
            "No Tickets yet."
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {figure.count} of {totalTickets} Tickets
              </span>{" "}
              · {hint}
            </>
          )}
        </p>
      </CardContent>
    </DashboardCard>
  );
}
