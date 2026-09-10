import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, CheckCircle2Icon, HourglassIcon, RefreshCwIcon } from "lucide-react";

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
import { analyticsOverviewQueryOptions, analyticsTrafficQueryOptions } from "./dashboard.hooks";
import {
  AgentLoadCard,
  ChannelCard,
  LiveBadge,
  RateCard,
  StatusSpreadCard,
  TotalCard,
  TrafficCard,
} from "./components";

function KpiCardSkeleton() {
  return (
    <Card className="gap-5 py-5">
      <CardHeader className="grid gap-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-24" />
      </CardHeader>
      <CardContent className="grid gap-2.5">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

function PanelSkeleton() {
  return (
    <Card>
      <CardHeader className="grid gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="grid gap-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

const SKELETON_SLOT_KEYS = Array.from({ length: 24 }, (_, hour) => `slot-${hour}`);

const SKELETON_ROW_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function HeatmapSkeleton() {
  return (
    <Card>
      <CardHeader className="grid gap-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="grid gap-2">
        {SKELETON_ROW_KEYS.map((rowKey) => (
          <div key={rowKey} className="flex gap-1.5">
            {SKELETON_SLOT_KEYS.map((slotKey) => (
              <Skeleton key={slotKey} className="size-6 rounded-md" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const DashboardView = () => {
  const user = useQuery(meQueryOptions);
  const isAdmin = user.data?.role === "ADMIN";
  const analytics = useQuery({ ...analyticsOverviewQueryOptions, enabled: isAdmin });
  const traffic = useQuery({ ...analyticsTrafficQueryOptions, enabled: isAdmin });

  if (!user.data) {
    return null;
  }

  const lastUpdatedAt = Math.max(analytics.dataUpdatedAt ?? 0, traffic.dataUpdatedAt ?? 0);
  const isRefreshing = analytics.isFetching || traffic.isFetching;

  function refreshAll() {
    analytics.refetch();
    traffic.refetch();
  }

  return (
    <PlatformAppShell>
      <TooltipProvider delayDuration={120}>
        <section className="grid gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-muted-foreground">Workspace overview</p>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">
                Workspace dashboard
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isAdmin
                  ? "Whether the AI Agent is actually helping. Every figure covers all Tickets in this Workspace."
                  : "Welcome back. Your queue, your Tickets, and the ones you previously resolved live in the Inbox."}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-2.5">
                <LiveBadge />
                {lastUpdatedAt > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Updated{" "}
                    {new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full px-3 text-xs"
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <PanelSkeleton />
                  <PanelSkeleton />
                  <PanelSkeleton />
                </div>
              </div>
            ) : analytics.data ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <TotalCard totalTickets={analytics.data.analytics.totalTickets} />
                  <RateCard
                    icon={CheckCircle2Icon}
                    title="AI resolutions —Â Customer‑confirmed"
                    info="The Customer said the problem was solved. Counted apart from auto-resolutions so AI effectiveness is never overstated."
                    hint="Customers who confirmed the fix."
                    figure={analytics.data.analytics.aiResolution.customerConfirmed}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={HourglassIcon}
                    title="AI resolutions —Â Customer‑inactive"
                    info="Auto-resolved after the Customer never replied to a Follow-Up. Counted apart from a confirmed fix."
                    hint="Closed after no reply to a Follow-Up."
                    figure={analytics.data.analytics.aiResolution.customerInactive}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={ArrowUpRightIcon}
                    title="Human escalation rate"
                    info="Tickets the AI Agent handed to a human because it could not safely continue, over the same denominator."
                    hint="Handed over by the AI Agent."
                    figure={analytics.data.analytics.humanEscalation}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <StatusSpreadCard counts={analytics.data.analytics.statusCounts} />
                  <ChannelCard counts={analytics.data.analytics.channelCounts} />
                  <AgentLoadCard loads={analytics.data.analytics.activeTicketsPerHumanAgent} />
                </div>

                {traffic.isPending ? (
                  <div className="grid gap-4">
                    <HeatmapSkeleton />
                    <HeatmapSkeleton />
                  </div>
                ) : traffic.data ? (
                  <div className="grid gap-4">
                    <TrafficCard
                      title="Conversation Traffic"
                      description="Tickets created per hour over the last 7 days."
                      metricLabel="Conversation Traffic"
                      buckets={traffic.data.analytics.traffic}
                    />
                    <TrafficCard
                      title="Resolutions"
                      description="Tickets resolved per hour over the last 7 days."
                      metricLabel="Resolutions"
                      buckets={traffic.data.analytics.resolutions}
                    />
                  </div>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Conversation Traffic unavailable</CardTitle>
                      <CardDescription>
                        {traffic.error instanceof Error
                          ? traffic.error.message
                          : "Failed to load the traffic report."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" size="sm" onClick={() => traffic.refetch()}>
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
                  <Button variant="outline" size="sm" onClick={() => analytics.refetch()}>
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
