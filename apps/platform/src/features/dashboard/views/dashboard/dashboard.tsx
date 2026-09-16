import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  InboxIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import { PlatformAppShell } from "../../../app-shell";
import { meQueryOptions } from "../../../auth";
import {
  analyticsOverviewQueryOptions,
  analyticsTrafficQueryOptions,
  recentConversationsQueryOptions,
} from "./dashboard.hooks";
import { formatRate, periodDelta, trailingRange } from "./dashboard.utils";
import type { DashboardRange } from "./dashboard.utils";
import {
  AgentLoadCard,
  ChannelCard,
  DateRangePicker,
  LiveBadge,
  RecentConversationsCard,
  StatusSpreadCard,
  TrafficCard,
  TrafficTrendCard,
  TrendCard,
} from "./components";

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-4 h-8 w-16" />
      <Skeleton className="mt-2 h-4 w-32" />
    </div>
  );
}

function PanelSkeleton() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
}

function HeatmapSkeleton() {
  return <Skeleton className="h-72 w-full rounded-xl" />;
}

const DashboardView = () => {
  const user = useQuery(meQueryOptions);
  const isAdmin = user.data?.role === "ADMIN";
  const [range, setRange] = useState<DashboardRange>(() => trailingRange(7));
  const analytics = useQuery({ ...analyticsOverviewQueryOptions(range), enabled: isAdmin });
  const traffic = useQuery({ ...analyticsTrafficQueryOptions(range), enabled: isAdmin });
  const recent = useQuery({ ...recentConversationsQueryOptions, enabled: isAdmin });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  if (!user.data) {
    return null;
  }

  const lastUpdatedAt = Math.max(
    analytics.dataUpdatedAt ?? 0,
    traffic.dataUpdatedAt ?? 0,
    recent.dataUpdatedAt ?? 0,
  );
  const isRefreshing = analytics.isFetching || traffic.isFetching;
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.data.name.split(/\s+/)[0] || "there";
  const overview = analytics.data?.analytics;
  const createdSeries = (overview?.trends ?? []).map((trend) => trend.created);
  const aiResolvedSeries = (overview?.trends ?? []).map((trend) => trend.aiResolved);
  const escalatedSeries = (overview?.trends ?? []).map((trend) => trend.escalated);
  const escalatedOpen =
    overview?.statusCounts.find((entry) => entry.status === "ESCALATED")?.count ?? 0;

  function refreshAll() {
    analytics.refetch();
    traffic.refetch();
    recent.refetch();
  }

  return (
    <PlatformAppShell fullWidth>
      <TooltipProvider delayDuration={0} skipDelayDuration={0} disableHoverableContent>
        <section className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {greeting}, {firstName} 👋
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {isAdmin
                  ? "How your AI Agent and Human Agents are handling Tickets."
                  : "Welcome back. Your queue and Tickets live in the Inbox."}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <DateRangePicker range={range} onChange={setRange} />
                <LiveBadge />
                {lastUpdatedAt > 0 ? (
                  <span
                    className="text-xs tabular-nums text-muted-foreground"
                    title={`Times shown in ${timeZone}`}
                  >
                    Updated{" "}
                    {new Date(lastUpdatedAt).toLocaleString(undefined, {
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      timeZone,
                      timeZoneName: "short",
                    })}
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer gap-1.5 rounded-full px-3 text-xs"
                  onClick={refreshAll}
                  disabled={isRefreshing}
                >
                  <RefreshCwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            ) : null}
          </div>
          {isAdmin ? (
            analytics.isPending ? (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  <PanelSkeleton />
                  <PanelSkeleton />
                  <PanelSkeleton />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <PanelSkeleton />
                  <PanelSkeleton />
                </div>
              </div>
            ) : overview ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <TrendCard
                    icon={InboxIcon}
                    title="Total Tickets"
                    accent="primary"
                    deltaTone="up-is-good"
                    info="Every Ticket created in this Workspace in the selected range, across all statuses and Channels."
                    value={String(overview.totalTickets)}
                    subtext="All statuses and Channels"
                    series={createdSeries}
                    delta={periodDelta(createdSeries)}
                  />
                  <TrendCard
                    icon={CheckCircle2Icon}
                    title="Resolved by AI"
                    accent="resolved"
                    deltaTone="up-is-good"
                    info="The Customer confirmed the AI Agent's answer worked."
                    value={formatRate(overview.aiResolution.customerConfirmed.rate)}
                    subtext={`${overview.aiResolution.customerConfirmed.count} of ${overview.totalTickets} Tickets`}
                    series={aiResolvedSeries}
                    delta={periodDelta(aiResolvedSeries)}
                  />
                  <TrendCard
                    icon={ArrowUpRightIcon}
                    title="Escalated to Humans"
                    accent="escalated"
                    deltaTone="up-is-bad"
                    info="Tickets the AI Agent handed to a human because it could not safely continue, over the same denominator."
                    value={formatRate(overview.humanEscalation.rate)}
                    subtext={`${overview.humanEscalation.count} of ${overview.totalTickets} Tickets`}
                    series={escalatedSeries}
                    delta={periodDelta(escalatedSeries)}
                  />
                  <TrendCard
                    icon={ClockIcon}
                    title="Awaiting Claim"
                    accent="danger"
                    deltaTone="up-is-bad"
                    info="Escalated Tickets waiting in the Shared Human Queue for a Human Agent to claim them."
                    value={String(escalatedOpen)}
                    subtext="In the Shared Human Queue"
                    series={escalatedSeries}
                    delta={periodDelta(escalatedSeries)}
                  />
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  <TrafficTrendCard trends={overview.trends} />
                  <ChannelCard counts={overview.channelCounts} />
                  <StatusSpreadCard counts={overview.statusCounts} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <AgentLoadCard agentStats={overview.agentStats} />
                  <RecentConversationsCard conversations={recent.data?.conversations ?? []} />
                </div>

                {traffic.isPending ? (
                  <div className="grid gap-4">
                    <HeatmapSkeleton />
                    <HeatmapSkeleton />
                  </div>
                ) : traffic.data ? (
                  <div className="grid gap-4">
                    <TrafficCard
                      title="Traffic by Hour"
                      description="Tickets created each hour in the selected range."
                      metricLabel="Tickets created"
                      buckets={traffic.data.analytics.traffic}
                      timeZone={timeZone}
                    />
                    <TrafficCard
                      title="Resolutions by Hour"
                      description="Tickets resolved each hour in the selected range."
                      metricLabel="Tickets resolved"
                      buckets={traffic.data.analytics.resolutions}
                      timeZone={timeZone}
                    />
                  </div>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Traffic unavailable</CardTitle>
                      <CardDescription>
                        {traffic.error instanceof Error
                          ? traffic.error.message
                          : "Failed to load the traffic report."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => traffic.refetch()}
                      >
                        Try again
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Analytics unavailable</CardTitle>
                  <CardDescription>
                    {analytics.error instanceof Error
                      ? analytics.error.message
                      : "Failed to load Workspace analytics."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => analytics.refetch()}
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            )
          ) : (
            <Card className="w-fit">
              <CardHeader>
                <CardTitle>Welcome back, {user.data.name}</CardTitle>
                <CardDescription>
                  Escalated Tickets are waiting in the Shared Human Queue.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/chat">My tickets</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/chat/unassigned">Shared queue</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </TooltipProvider>
    </PlatformAppShell>
  );
};

export default DashboardView;
