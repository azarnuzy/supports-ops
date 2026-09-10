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
      <CardHeader className="gap-4">
        <div className="flex min-h-10 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <CardDescription className="text-sm font-medium leading-5 text-foreground text-balance">
            {title}
          </CardDescription>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${title}`}
                className="ml-auto cursor-help rounded-full p-1 text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{info}</TooltipContent>
          </Tooltip>
        </div>
        <CardTitle className="text-4xl leading-none tabular-nums tracking-tight">
          {formatRate(figure.rate)}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-auto grid gap-3">
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
              <span className="font-semibold tabular-nums text-foreground">
                {figure.count} / {totalTickets} Tickets
              </span>{" "}
              · {hint}
            </>
          )}
        </p>
      </CardContent>
    </DashboardCard>
  );
}
