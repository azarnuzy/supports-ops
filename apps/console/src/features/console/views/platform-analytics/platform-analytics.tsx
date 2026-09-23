import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleSectionHeading,
} from "../../components/console-patterns";
import DateRangePicker, {
  type ConsoleDateRange,
  trailingRange,
} from "../../components/date-range-picker";
import BreakdownChart from "../overview/components/breakdown-chart";
import { operatorOverviewQueryOptions } from "../overview/overview.services";
import { formatCount } from "../overview/overview.utils";
import TrendChart from "./components/trend-chart";
import { platformAnalyticsTrendsQueryOptions } from "./platform-analytics.services";

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

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 1000) / 10}%`;
}

export default function PlatformAnalyticsView() {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const trends = useQuery(platformAnalyticsTrendsQueryOptions(range));

  const data = overview.data?.overview;
  const trendData = trends.data;
  const isPending = overview.isPending || trends.isPending;
  const isError = overview.isError || trends.isError;
  const error = overview.error ?? trends.error;

  return (
    <>
      <ConsolePageHeader
        title="Platform Analytics"
        description="Cross-Workspace Session, Ticket, and Channel reports across every Workspace."
        actions={<DateRangePicker range={range} onChange={setRange} />}
      />

      {isPending || isError || !data || !trendData ? (
        <ConsoleQueryState
          isPending={isPending}
          isError={isError}
          error={error}
          errorFallback="Failed to load Platform Analytics."
          isEmpty={!isPending && !isError && (!data || !trendData)}
          emptyTitle="No Platform Analytics data"
          emptyDescription="Session and Ticket data is not available yet."
          onRetry={() => {
            void overview.refetch();
            void trends.refetch();
          }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetricCard
              label="Sessions (all Channels)"
              value={formatCount(Object.values(data.sessions).reduce((sum, n) => sum + n, 0))}
            />
            <ConsoleMetricCard
              label="Tickets created"
              value={formatCount(
                Object.values(data.tickets.byStatus).reduce((sum, n) => sum + n, 0),
              )}
            />
            <ConsoleMetricCard
              label="AI effectiveness"
              value={formatRate(trendData.aiEffectiveness.rate)}
            />
            <ConsoleMetricCard
              label="AI-confirmed resolutions"
              value={`${formatCount(trendData.aiEffectiveness.count)} / ${formatCount(trendData.aiEffectiveness.total)}`}
            />
          </div>

          <ConsoleSectionHeading title="Daily trend" />
          <TrendChart
            data={trendData.sessions.map((sessionDay, index) => ({
              date: sessionDay.date,
              sessions: sessionDay.count,
              ticketsCreated: trendData.tickets[index]?.created ?? 0,
            }))}
          />

          <ConsoleSectionHeading title="Breakdowns" />
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
