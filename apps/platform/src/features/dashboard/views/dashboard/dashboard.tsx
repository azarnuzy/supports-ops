import type {
  AnalyticsAgentLoad,
  AnalyticsChannelCount,
  AnalyticsStatusCount,
  ResolutionFigure,
} from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { StatusBadge } from "@repo/ui/components/ticket-badge";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlatformAppShell } from "../../../app-shell";
import { meQueryOptions } from "../../../auth";
import { analyticsOverviewQueryOptions, analyticsTrafficQueryOptions } from "../../dashboard.hooks";
import { ConversationTrafficCard, ResolutionsCard } from "./components";

const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});
const channelTypeLabels: Record<string, string> = { WEB: "Web", WHATSAPP: "WhatsApp" };

function formatRate(rate: number | null) {
  return rate === null ? "—" : percentFormat.format(rate);
}

const DashboardView = () => {
  const user = useQuery(meQueryOptions);
  const isAdmin = user.data?.role === "ADMIN";
  const analytics = useQuery({ ...analyticsOverviewQueryOptions, enabled: isAdmin });
  const traffic = useQuery({ ...analyticsTrafficQueryOptions, enabled: isAdmin });

  if (!user.data) {
    return null;
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace overview</p>
          <h1 className="text-3xl font-semibold text-balance">Workspace dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isAdmin
              ? "Whether the AI Agent is actually helping. Every figure covers all Tickets in this Workspace."
              : "Welcome back. Your queue, your Tickets, and the ones you previously resolved live in the Inbox."}
          </p>
        </div>

        {isAdmin ? (
          analytics.data ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <RateCard
                  description="The Customer said the problem was solved."
                  figure={analytics.data.analytics.aiResolution.customerConfirmed}
                  title="AI resolutions — Customer-confirmed"
                  totalTickets={analytics.data.analytics.totalTickets}
                />
                <RateCard
                  description="Auto-resolved after the Customer never replied to a Follow-Up. Counted apart from a confirmed fix."
                  figure={analytics.data.analytics.aiResolution.customerInactive}
                  title="AI resolutions — Customer-inactive"
                  totalTickets={analytics.data.analytics.totalTickets}
                />
                <RateCard
                  description="Tickets the AI Agent handed to a human, over the same denominator."
                  figure={analytics.data.analytics.humanEscalation}
                  title="Human escalation rate"
                  totalTickets={analytics.data.analytics.totalTickets}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <StatusSpreadCard counts={analytics.data.analytics.statusCounts} />
                <ChannelCard counts={analytics.data.analytics.channelCounts} />
                <AgentLoadCard loads={analytics.data.analytics.activeTicketsPerHumanAgent} />
              </div>

              {traffic.data ? (
                <div className="grid gap-4">
                  <ConversationTrafficCard buckets={traffic.data.analytics.traffic} />
                  <ResolutionsCard buckets={traffic.data.analytics.resolutions} />
                </div>
              ) : null}
            </>
          ) : null
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
    </PlatformAppShell>
  );
};

function RateCard({
  title,
  description,
  figure,
  totalTickets,
}: {
  title: string;
  description: string;
  figure: ResolutionFigure;
  totalTickets: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{formatRate(figure.rate)}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {totalTickets === 0
          ? "No Tickets yet."
          : `${figure.count} of ${totalTickets} Tickets. ${description}`}
      </CardContent>
    </Card>
  );
}

function StatusSpreadCard({ counts }: { counts: AnalyticsStatusCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket statuses</CardTitle>
        <CardDescription>The current spread across the Workspace.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {counts.map((entry) => (
          <div key={entry.status} className="flex items-center justify-between gap-2">
            <StatusBadge status={entry.status} />
            <span className="text-sm font-medium tabular-nums">{entry.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChannelCard({ counts }: { counts: AnalyticsChannelCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets by Channel</CardTitle>
        <CardDescription>Where conversations arrive.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {counts.map((channel) => (
          <div key={channel.channelId} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {channel.channelName}
              <Badge variant="outline">
                {channelTypeLabels[channel.channelType] ?? channel.channelType}
              </Badge>
            </span>
            <span className="text-sm font-medium tabular-nums">{channel.ticketCount}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AgentLoadCard({ loads }: { loads: AnalyticsAgentLoad[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Tickets per Human Agent</CardTitle>
        <CardDescription>Who is holding human-handled work right now.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loads.length ? (
          loads.map((load) => (
            <div key={load.humanAgentId} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{load.humanAgentName}</span>
              <span className="text-sm font-medium tabular-nums">{load.activeTicketCount}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No active human-handled Tickets.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardView;
