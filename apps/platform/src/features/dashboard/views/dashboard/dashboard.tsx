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
    <Card className="h-full gap-5 py-5">
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
const SKELETON_GRID_STYLE = { gridTemplateColumns: "repeat(24, minmax(1rem, 1fr))" };

function HeatmapSkeleton() {
  return (
    <Card>
      <CardHeader className="grid gap-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {SKELETON_ROW_KEYS.map((rowKey) => (
          <div key={rowKey} className="grid gap-1" style={SKELETON_GRID_STYLE}>
            {SKELETON_SLOT_KEYS.map((slotKey) => (
              <Skeleton key={slotKey} className="aspect-square w-full rounded-md" />
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
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

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
      <TooltipProvider delayDuration={0} skipDelayDuration={0} disableHoverableContent>
        <section className="grid gap-10">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-muted-foreground">Workspace overview</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">
                Workspace dashboard
              </h1>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                {isAdmin
                  ? "See how the AI Agent and Human Agents are handling Tickets across this Workspace."
                  : "Welcome back. Your queue, your Tickets, and the ones you previously resolved live in the Inbox."}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-end gap-2.5">
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
              <div className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                </div>
                <div className="grid gap-5 xl:grid-cols-3">
                  <PanelSkeleton />
                  <PanelSkeleton />
                  <PanelSkeleton />
                </div>
              </div>
            ) : analytics.data ? (
              <>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <TotalCard totalTickets={analytics.data.analytics.totalTickets} />
                  <RateCard
                    icon={CheckCircle2Icon}
                    title="AI resolved · confirmed"
                    info="The Customer said the problem was solved. Counted apart from auto-resolutions so AI effectiveness is never overstated."
                    hint="Customer confirmed the answer worked."
                    figure={analytics.data.analytics.aiResolution.customerConfirmed}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={HourglassIcon}
                    title="AI resolved · no reply"
                    info="Auto-resolved after the Customer never replied to a Follow-Up. Counted apart from a confirmed fix."
                    hint="Auto-resolved after no Follow-Up reply."
                    figure={analytics.data.analytics.aiResolution.customerInactive}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={ArrowUpRightIcon}
                    title="Escalated to humans"
                    info="Tickets the AI Agent handed to a human because it could not safely continue, over the same denominator."
                    hint="AI Agent escalated to a human."
                    figure={analytics.data.analytics.humanEscalation}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={HourglassIcon}
                    title="Customer inactive · handled"
                    info="Timer-closed after Customer silence while a Human Agent owned the Ticket. Never counted as an AI resolution."
                    hint="Customer went quiet with a Human Agent."
                    figure={analytics.data.analytics.humanIdleClosure.handled}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                  <RateCard
                    icon={HourglassIcon}
                    title="Customer inactive · queue"
                    info="Timer-closed before anyone claimed the Ticket, kept separate to reveal understaffing."
                    hint="Customer went quiet in the Shared Human Queue."
                    figure={analytics.data.analytics.humanIdleClosure.sharedQueue}
                    totalTickets={analytics.data.analytics.totalTickets}
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-3">
                  <StatusSpreadCard counts={analytics.data.analytics.statusCounts} />
                  <ChannelCard counts={analytics.data.analytics.channelCounts} />
                  <AgentLoadCard loads={analytics.data.analytics.activeTicketsPerHumanAgent} />
                </div>

                {traffic.isPending ? (
                  <div className="grid gap-5">
                    <HeatmapSkeleton />
                    <HeatmapSkeleton />
                  </div>
                ) : traffic.data ? (
                  <div className="grid gap-5">
                    <TrafficCard
                      title="Conversation Traffic"
                      description="Tickets created each hour during the past 7 days."
                      metricLabel="Tickets created"
                      buckets={traffic.data.analytics.traffic}
                      timeZone={timeZone}
                    />
                    <TrafficCard
                      title="Resolutions"
                      description="Tickets resolved each hour during the past 7 days."
                      metricLabel="Tickets resolved"
                      buckets={traffic.data.analytics.resolutions}
                      timeZone={timeZone}
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
