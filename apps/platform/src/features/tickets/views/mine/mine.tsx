import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { PlatformAppShell } from "../../../app-shell";
import { myTicketsQueryOptions } from "../../tickets.hooks";

const MyTicketsView = () => {
  const tickets = useQuery(myTicketsQueryOptions);
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
              <div
                className="flex items-center justify-between rounded-lg border p-4"
                key={ticket.id}
              >
                <div>
                  <p className="font-medium text-foreground">{ticket.title}</p>
                  <p>Customer: {ticket.customerIdentity.name}</p>
                </div>
                <Badge variant="outline">{ticket.priority} priority</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default MyTicketsView;
