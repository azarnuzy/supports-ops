import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlatformAppShell } from "../../../app-shell";
import { meQueryOptions } from "../../../auth";
import { analyticsOverviewQueryOptions, analyticsTrafficQueryOptions } from "./dashboard.hooks";
import {
  AgentLoadCard,
  ChannelCard,
  ConversationTrafficCard,
  RateCard,
  ResolutionsCard,
  StatusSpreadCard,
} from "./components";

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

export default DashboardView;
