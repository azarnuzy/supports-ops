import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { PlatformAppShell } from "../../../app-shell";
import { myTicketsQueryOptions, useTicketEvents } from "../../tickets.hooks";

const MyTicketsView = () => {
  const tickets = useQuery(myTicketsQueryOptions);
  useTicketEvents();
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Human Agent workspace</p>
          <h1 className="text-3xl font-semibold text-balance">My tickets</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Assigned tickets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            {tickets.isPending ? <p>Loading…</p> : null}
            {tickets.isError ? (
              <p className="text-destructive">Unable to load your Tickets.</p>
            ) : null}
            {tickets.data?.tickets.length === 0 ? <p>Tickets you claim will appear here.</p> : null}
            {tickets.data?.tickets.map((ticket) => (
              <div className="grid gap-3 rounded-lg border p-4" key={ticket.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{ticket.title}</p>
                    <p>Customer: {ticket.customerIdentity.name}</p>
                  </div>
                  <Badge variant="outline">{ticket.priority} priority</Badge>
                </div>
                {ticket.escalationSummaryStatus === "PENDING" ? (
                  <p>Preparing the Escalation Summary…</p>
                ) : null}
                {ticket.escalationSummaryStatus === "FAILED" ? (
                  <p>The Escalation Summary could not be generated. Review the conversation directly.</p>
                ) : null}
                {ticket.escalationSummaryStatus === "READY" && ticket.escalationSummary ? (
                  <article className="whitespace-pre-wrap rounded-md bg-muted p-3 text-foreground">
                    {ticket.escalationSummary}
                  </article>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default MyTicketsView;
