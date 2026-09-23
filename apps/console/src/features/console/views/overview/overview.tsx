import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import BreakdownChart from "./components/breakdown-chart";
import DateRangePicker from "./components/date-range-picker";
import { operatorOverviewQueryOptions } from "./overview.services";
import { formatCount, formatIdr, formatUsd, trailingRange } from "./overview.utils";
import type { OverviewRange } from "./overview.utils";

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

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="py-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardContent>
    </Card>
  );
}

export default function OverviewView() {
  const [range, setRange] = useState<OverviewRange>(() => trailingRange(7));
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const data = overview.data?.overview;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker range={range} onChange={setRange} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCwIcon className={cn("size-3.5", overview.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {overview.isPending ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Workspaces (total)" value={formatCount(data.workspaces.total)} />
            <KpiTile label="Workspaces (new)" value={formatCount(data.workspaces.new)} />
            <KpiTile label="Revenue" value={formatIdr(data.revenueIdr)} />
            <KpiTile label="Provider cost" value={formatUsd(data.providerCostUsd)} />
            <KpiTile label="Credits spent" value={formatCount(data.credits.spent)} />
            <KpiTile label="Credits topped up" value={formatCount(data.credits.topUps)} />
            <KpiTile label="Trial Grant Credits" value={formatCount(data.credits.trialGrants)} />
            <KpiTile
              label="Sessions (all Channels)"
              value={formatCount(Object.values(data.sessions).reduce((sum, n) => sum + n, 0))}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Overview unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.error instanceof Error
              ? overview.error.message
              : "Failed to load the overview."}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
