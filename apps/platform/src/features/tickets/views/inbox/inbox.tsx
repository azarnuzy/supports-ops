import type { TicketCategory, TicketPriority, TicketStatus } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { InboxIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { meQueryOptions, workspaceUsersQueryOptions } from "../../../auth";
import { ticketsQueryOptions } from "../../tickets.hooks";
import { getTickets } from "../../tickets.services";

const statusOptions: { label: string; value: TicketStatus }[] = [
  { label: "AI handling", value: "AI_HANDLING" },
  { label: "Escalated", value: "ESCALATED" },
  { label: "Human handling", value: "HUMAN_HANDLING" },
  { label: "Resolved", value: "RESOLVED" },
];

const categoryOptions: { label: string; value: TicketCategory }[] = [
  { label: "Account", value: "ACCOUNT" },
  { label: "Billing", value: "BILLING" },
  { label: "Subscription", value: "SUBSCRIPTION" },
  { label: "Technical", value: "TECHNICAL" },
  { label: "General", value: "GENERAL" },
];

const priorityOptions: { label: string; value: TicketPriority }[] = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "High", value: "HIGH" },
];

const ALL = "all";

const InboxView = () => {
  const user = useQuery(meQueryOptions);
  const humanAgents = useQuery({
    ...workspaceUsersQueryOptions,
    enabled: user.data?.role === "ADMIN",
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<TicketCategory | typeof ALL>(ALL);
  const [priority, setPriority] = useState<TicketPriority | typeof ALL>(ALL);
  const [assigneeId, setAssigneeId] = useState<string>(ALL);

  const filters = useMemo(
    () => ({
      assigneeId: assigneeId === ALL ? undefined : assigneeId,
      category: category === ALL ? undefined : [category],
      priority: priority === ALL ? undefined : [priority],
      search: search.trim() || undefined,
      status: status === ALL ? undefined : [status],
    }),
    [assigneeId, category, priority, search, status],
  );

  const tickets = useInfiniteQuery({
    getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      getTickets({ ...filters, cursor: pageParam }),
    queryKey: [...ticketsQueryOptions(filters).queryKey, "infinite"] as const,
  });

  const rows = tickets.data?.pages.flatMap((page) => page.tickets) ?? [];

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Inbox</p>
          <h1 className="text-3xl font-semibold text-balance">Tickets</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {user.data?.role === "ADMIN"
              ? "Every Ticket in the Workspace."
              : "The queue, your own Tickets, and the ones you previously resolved."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="max-w-xs">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by customer name or email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {user.data?.role === "ADMIN" ? (
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All assignees</SelectItem>
                {humanAgents.data?.users
                  .filter((agent) => agent.role === "HUMAN_AGENT")
                  .map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.isPending
                ? ["a", "b", "c", "d", "e"].map((key) => (
                    <TableRow key={`skeleton-${key}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}
              {tickets.isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-destructive">
                    Unable to load Tickets.
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((ticket) => (
                <TableRow key={ticket.id} className="cursor-pointer">
                  <TableCell className="max-w-xs">
                    <Link
                      to="/tickets/$id"
                      params={{ id: ticket.id }}
                      className="block truncate font-medium hover:underline"
                    >
                      {ticket.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{ticket.customerIdentity.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ticket.customerIdentity.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ticket.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>{ticket.assignedHumanAgent?.name ?? "Unassigned"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!tickets.isPending && !tickets.isError && rows.length === 0 ? (
            <Empty className="border-0">
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No Tickets match these filters</EmptyTitle>
              <EmptyDescription>Try widening the search or clearing a filter.</EmptyDescription>
            </Empty>
          ) : null}
        </div>

        {tickets.hasNextPage ? (
          <Button
            variant="outline"
            className="w-fit"
            disabled={tickets.isFetchingNextPage}
            onClick={() => void tickets.fetchNextPage()}
          >
            {tickets.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default InboxView;
