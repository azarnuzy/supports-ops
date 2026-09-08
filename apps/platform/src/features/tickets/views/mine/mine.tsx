import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import {
  myTicketsQueryOptions,
  useResolveHumanTicketMutation,
  useSendHumanReplyMutation,
  useTicketEvents,
} from "../../tickets.hooks";

const MyTicketsView = () => {
  const tickets = useQuery(myTicketsQueryOptions);
  const reply = useSendHumanReplyMutation();
  const resolve = useResolveHumanTicketMutation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
                <div className="grid gap-2 rounded-md bg-muted p-3 text-foreground">
                  {ticket.messages.map((message) => (
                    <p key={message.position} className={message.senderType === "CUSTOMER" ? "font-medium" : ""}>
                      <span className="text-muted-foreground">{message.senderType.replace("_", " ")}: </span>
                      {message.content}
                      {message.senderType === "HUMAN_AGENT" && message.deliveryStatus !== "SENT" ? (
                        <span className="ml-2 text-xs text-muted-foreground">{message.deliveryStatus.toLowerCase()}</span>
                      ) : null}
                    </p>
                  ))}
                </div>
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const content = drafts[ticket.id]?.trim();
                    if (!content) return;
                    reply.mutate({ id: ticket.id, content }, { onSuccess: () => setDrafts((value) => ({ ...value, [ticket.id]: "" })) });
                  }}
                >
                  <Textarea
                    aria-label={`Reply to ${ticket.customerIdentity.name}`}
                    onChange={(event) => setDrafts((value) => ({ ...value, [ticket.id]: event.target.value }))}
                    placeholder="Write a reply…"
                    value={drafts[ticket.id] ?? ""}
                  />
                  <div className="flex gap-2">
                    <Button disabled={reply.isPending || !drafts[ticket.id]?.trim()} type="submit">Send reply</Button>
                    <Button disabled={resolve.isPending} onClick={() => resolve.mutate(ticket.id)} type="button" variant="outline">Resolve Ticket</Button>
                  </div>
                  {reply.isError || resolve.isError ? <p className="text-destructive">Unable to update this Ticket. Please try again.</p> : null}
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default MyTicketsView;
