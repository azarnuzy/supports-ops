import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import {
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleQueryState,
} from "../../components/console-patterns";
import DateRangePicker, {
  type ConsoleDateRange,
  trailingRange,
} from "../../components/date-range-picker";
import BreakdownChart from "./components/breakdown-chart";
import { operatorOverviewQueryOptions } from "./overview.services";
import { formatCount, formatIdr, formatUsd } from "./overview.utils";

const statusLabels: Record<string, string> = {
  AI_HANDLING: "AI handling",
  ESCALATED: "Escalated",
  HUMAN_HANDLING: "Human handling",
  RESOLVED: "Resolved",
};

const resolutionReasonLabels: Record<string, string> = {
  HUMAN_RESOLVED: "Human resolved",
  CUSTOMER_CONFIRMED: "Customer confirmed",
  CUSTOMER_INACTIVE: "Customer inactive (AI)",
  CUSTOMER_INACTIVE_HUMAN_HANDLING: "Customer inactive (assigned)",
  CUSTOMER_INACTIVE_SHARED_QUEUE: "Customer inactive (unclaimed)",
};

const channelLabels: Record<string, string> = { WEB: "Web Widget", WHATSAPP: "WhatsApp" };

export default function OverviewView() {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const data = overview.data?.overview;

  return (
    <>
      <ConsolePageHeader
        title="Overview"
        description="Platform activity and usage across all Workspaces."
        actions={
          <>
            <DateRangePicker range={range} onChange={setRange} />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => void overview.refetch()}
              disabled={overview.isFetching}
            >
              <RefreshCwIcon
                className={cn("size-3.5", overview.isFetching && "animate-spin")}
              />
              {overview.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {overview.isPending || overview.isError || !data ? (
        <ConsoleQueryState
          isPending={overview.isPending}
          isError={overview.isError}
          error={overview.error}
          errorFallback="Failed to load the overview."
          isEmpty={!overview.isPending && !overview.isError && !data}
          emptyTitle="No overview data"
          emptyDescription="Overview metrics are not available yet."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetricCard
              label="Workspaces (total)"
              value={formatCount(data.workspaces.total)}
            />
            <ConsoleMetricCard
              label="Workspaces (new)"
              value={formatCount(data.workspaces.new)}
            />
            <ConsoleMetricCard label="Revenue" value={formatIdr(data.revenueIdr)} />
            <ConsoleMetricCard label="Provider cost" value={formatUsd(data.providerCostUsd)} />
            <ConsoleMetricCard label="Credits spent" value={formatCount(data.credits.spent)} />
            <ConsoleMetricCard
              label="Credits topped up"
              value={formatCount(data.credits.topUps)}
            />
            <ConsoleMetricCard
              label="Trial Grant Credits"
              value={formatCount(data.credits.trialGrants)}
            />
            <ConsoleMetricCard
              label="Sessions (all Channels)"
              value={formatCount(Object.values(data.sessions).reduce((sum, n) => sum + n, 0))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownChart
              title="Sessions per Channel"
              data={Object.entries(data.sessions).map(([channel, value]) => ({
                label: channelLabels[channel] ?? channel,
                value,
              }))}
            />
            <BreakdownChart
              title="Tickets by status"
              data={Object.entries(data.tickets.byStatus).map(([status, value]) => ({
                label: statusLabels[status] ?? status,
                value,
              }))}
            />
            <BreakdownChart
              title="Tickets by Resolution Reason"
              data={Object.entries(data.tickets.byResolutionReason).map(([reason, value]) => ({
                label: resolutionReasonLabels[reason] ?? reason,
                value,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
