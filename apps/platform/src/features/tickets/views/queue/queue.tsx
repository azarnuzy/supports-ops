import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { meQueryOptions, workspaceUsersQueryOptions } from "../../../auth";
import {
  sharedHumanQueueQueryOptions,
  liveAiTicketsQueryOptions,
  useClaimTicketMutation,
  useReassignTicketMutation,
  useSharedHumanQueueEvents,
  useTakeOverTicketMutation,
} from "../../tickets.hooks";

function priorityVariant(priority: "LOW" | "NORMAL" | "HIGH") {
  return priority === "HIGH" ? "destructive" : priority === "LOW" ? "secondary" : "outline";
}

const SharedHumanQueueView = () => {
  const queue = useQuery(sharedHumanQueueQueryOptions);
  const user = useQuery(meQueryOptions);
  const humanAgents = useQuery({
    ...workspaceUsersQueryOptions,
    enabled: user.data?.role === "ADMIN",
  });
  const claim = useClaimTicketMutation();
  const reassign = useReassignTicketMutation();
  const liveTickets = useQuery({
    ...liveAiTicketsQueryOptions,
    enabled: user.data?.role === "ADMIN",
  });
  const takeover = useTakeOverTicketMutation();
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  useSharedHumanQueueEvents();

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Human Agent workspace</p>
          <h1 className="text-3xl font-semibold text-balance">Shared Human Queue</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Escalated Tickets appear for everyone in the same oldest-first order. Priority is shown
            but never changes that order.
          </p>
        </div>
        {user.data?.role === "ADMIN" ? (
          <Card>
            <CardHeader>
              <CardTitle>Live AI-handled Tickets</CardTitle>
              <CardDescription>
                Watch Customer and AI Agent messages as they arrive, then take over when needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {liveTickets.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : null}
              {liveTickets.isError ? (
                <p className="text-sm text-destructive">Unable to load live Tickets.</p>
              ) : null}
              {liveTickets.data?.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Tickets are currently handled by the AI Agent.
                </p>
              ) : null}
              {liveTickets.data?.tickets.map((ticket) => (
                <div className="rounded-lg border p-4" key={ticket.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Customer: {ticket.customerIdentity.name}
                      </p>
                    </div>
                    <Button
                      disabled={takeover.isPending}
                      onClick={() =>
                        takeover.mutate(ticket.id, {
                          onSuccess: () => toast.success("Ticket taken over."),
                          onError: (error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Unable to take over Ticket.",
                            ),
                        })
                      }
                    >
                      {takeover.isPending ? "Taking over…" : "Take over"}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 border-t pt-3 text-sm">
                    {ticket.messages.map((message) => (
                      <p key={message.position}>
                        <span className="font-medium">
                          {message.senderType.replaceAll("_", " ")}:
                        </span>{" "}
                        {message.content}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Waiting for a Human Agent</CardTitle>
            <CardDescription>
              Updates arrive automatically as Tickets escalate or are claimed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {queue.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {queue.isError ? (
              <p className="text-sm text-destructive">Unable to load the Shared Human Queue.</p>
            ) : null}
            {queue.data?.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No escalated Tickets are waiting.</p>
            ) : null}
            {queue.data?.tickets.map((ticket) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                key={ticket.id}
              >
                <div>
                  <p className="font-medium">{ticket.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Customer: {ticket.customerIdentity.name} · Waiting since{" "}
                    {new Date(ticket.escalatedAt ?? ticket.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={priorityVariant(ticket.priority)}>
                    {ticket.priority} priority
                  </Badge>
                  {user.data?.role === "HUMAN_AGENT" ? (
                    <Button
                      disabled={claim.isPending}
                      onClick={() =>
                        claim.mutate(ticket.id, {
                          onSuccess: () => toast.success("Ticket claimed."),
                          onError: (error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Unable to claim Ticket.",
                            ),
                        })
                      }
                    >
                      {claim.isPending ? "Claiming…" : "Claim"}
                    </Button>
                  ) : null}
                  {user.data?.role === "ADMIN" ? (
                    <>
                      <Select
                        value={assignees[ticket.id] ?? ""}
                        onValueChange={(humanAgentId) =>
                          setAssignees((current) => ({ ...current, [ticket.id]: humanAgentId }))
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Choose Human Agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {humanAgents.data?.users
                            .filter((agent) => agent.role === "HUMAN_AGENT")
                            .map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={!assignees[ticket.id] || reassign.isPending}
                        onClick={() =>
                          reassign.mutate(
                            { id: ticket.id, humanAgentId: assignees[ticket.id] },
                            {
                              onSuccess: () => toast.success("Ticket reassigned."),
                              onError: (error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to reassign Ticket.",
                                ),
                            },
                          )
                        }
                      >
                        Assign
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default SharedHumanQueueView;
