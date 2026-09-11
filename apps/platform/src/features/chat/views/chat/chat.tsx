import type { TicketCategory, TicketPriority, TicketStatus } from "@repo/api-client";
import { webAttachmentCapability } from "@repo/channels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Empty, EmptyDescription, EmptyTitle } from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@repo/ui/components/input-group";
import { MessageScroller, MessageScrollerContent } from "@repo/ui/components/message-scroller";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  PaperclipIcon,
  SendIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { useTicketCategoriesQuery } from "../../../ticket-categories";
import { formatEnumLabel, getInitials } from "../../../../lib/utils";
import { meQueryOptions, workspaceUsersQueryOptions } from "../../../auth";
import { describeActivity } from "../../../tickets/activity-description";
import {
  liveAiTicketsQueryOptions,
  myTicketsQueryOptions,
  useAllTicketsQuery,
  sharedHumanQueueQueryOptions,
  ticketDetailQueryOptions,
  useClaimTicketMutation,
  useGenerateSuggestedReplyMutation,
  useMarkTicketReadOnView,
  useReassignTicketMutation,
  useResolveHumanTicketMutation,
  useRetryHumanReplyMutation,
  useSendHumanReplyMutation,
  useSendHumanAttachmentsMutation,
  useTakeOverTicketMutation,
  useTicketDetailEvents,
  useTicketEvents,
} from "../../../tickets/tickets.hooks";
import {
  priorityFilterOptions,
  scopeRoutes,
  statusFilterOptions,
} from "./chat.constants";
import type { DetailsTab, TicketScope } from "./chat.types";
import { isImage, scopeUnreadTotal } from "./chat.utils";
import {
  AllTicketRow,
  ImageGallery,
  SelectedFile,
  TicketInspector,
  TicketRow,
  TranscriptMessage,
} from "./components";

/** One labelled option list inside the filter popover; the active option
 * toggles off, so every dimension can also be cleared from within. */
function FilterGroup({
  activeValue,
  label,
  onToggle,
  options,
}: {
  activeValue: string;
  label: string;
  onToggle: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {options.map((option) => (
        <button
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px] hover:bg-accent",
            option.value === activeValue && "bg-accent font-medium",
          )}
          key={option.value}
          onClick={() => onToggle(option.value)}
          type="button"
        >
          {option.label}
          {option.value === activeValue ? <CheckIcon className="size-3.5" /> : null}
        </button>
      ))}
    </div>
  );
}

const ChatView = ({ scope = "mine", ticketId }: { scope?: TicketScope; ticketId?: string }) => {
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const isAdmin = me.data?.role === "ADMIN";
  const mineTickets = useQuery(myTicketsQueryOptions);
  const unassignedTickets = useQuery(sharedHumanQueueQueryOptions);
  const aiLiveTickets = useQuery({ ...liveAiTicketsQueryOptions, enabled: isAdmin });
  const humanAgents = useQuery({ ...workspaceUsersQueryOptions, enabled: isAdmin });
  const ticket = useQuery({
    ...ticketDetailQueryOptions(ticketId ?? ""),
    enabled: Boolean(ticketId),
  });
  useTicketEvents();
  const { reconnecting } = useTicketDetailEvents(ticketId);
  useMarkTicketReadOnView(ticket.data?.ticket);

  const sendReply = useSendHumanReplyMutation();
  const sendAttachments = useSendHumanAttachmentsMutation();
  const suggestedReply = useGenerateSuggestedReplyMutation();
  const resolve = useResolveHumanTicketMutation();
  const retryReply = useRetryHumanReplyMutation();
  const claim = useClaimTicketMutation();
  const takeover = useTakeOverTicketMutation();
  const reassign = useReassignTicketMutation();
  const [assigneeId, setAssigneeId] = useState<string>();
  const tickets =
    scope === "unassigned" ? unassignedTickets : scope === "ai-live" ? aiLiveTickets : mineTickets;

  const routeSearch = useSearch({ strict: false });
  const search = routeSearch.q ?? "";
  const statusFilter = routeSearch.status as TicketStatus | undefined;
  const priorityFilter = routeSearch.priority as TicketPriority | undefined;
  const categoryFilter = routeSearch.category as TicketCategory | undefined;
  const currentLocation = ticketId
    ? { params: { ticketId }, to: scopeRoutes[scope].ticket }
    : { to: scopeRoutes[scope].list };
  const setSearch = (value: string) =>
    void navigate({
      ...currentLocation,
      replace: true,
      search: (prev: Record<string, string | undefined>) => ({ ...prev, q: value || undefined }),
    });
  // Categories are Workspace-configured, so the filter list is fetched rather than hard-coded.
  const ticketCategories = useTicketCategoriesQuery();
  const categoryFilterOptions = [
    { label: "All categories", value: "ALL" },
    ...(ticketCategories.data?.categories ?? []).map((category) => ({
      label: category.label,
      value: category.key,
    })),
  ];
  const activeFilterEntries = [
    { key: "status", options: statusFilterOptions, value: statusFilter },
    { key: "priority", options: priorityFilterOptions, value: priorityFilter },
    { key: "category", options: categoryFilterOptions, value: categoryFilter },
  ].filter((entry) => entry.value !== undefined);
  const activeFilters = activeFilterEntries.map(({ key, options, value }) => ({
    key,
    label: options.find((option) => option.value === value)?.label ?? formatEnumLabel(value ?? ""),
  }));
  const activeFilterCount = activeFilters.length;
  const setListFilter = (key: string, value: string | undefined) =>
    void navigate({
      ...currentLocation,
      replace: true,
      search: (prev: Record<string, string | undefined>) => ({
        ...prev,
        [key]: value || undefined,
      }),
    });
  const allTickets = useAllTicketsQuery({
    category: scope === "all" ? categoryFilter : undefined,
    enabled: scope === "all",
    priority: scope === "all" ? priorityFilter : undefined,
    search: scope === "all" ? search || undefined : undefined,
    status: scope === "all" ? statusFilter : undefined,
  });
  const allTicketRows = allTickets.data?.pages.flatMap((page) => page.tickets) ?? [];
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("details");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [suggestedReplyContent, setSuggestedReplyContent] = useState<string>();
  const replyKey = useRef<string | undefined>(undefined);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  // Entering a populated scope selects the first Ticket so the workspace never
  // opens on an arbitrary blank state.
  useEffect(() => {
    if (scope === "all" || ticketId || !tickets.data) return;
    const first = tickets.data.tickets[0];
    if (first) {
      void navigate({
        params: { ticketId: first.id },
        replace: true,
        search: (prev) => prev,
        to: scopeRoutes[scope].ticket,
      });
    }
  }, [navigate, scope, ticketId, tickets.data]);

  const rows = tickets.data?.tickets.filter((row) =>
    row.customerIdentity.name.toLowerCase().includes(search.toLowerCase()),
  );

  const detail = ticket.data?.ticket;
  const canReply =
    Boolean(detail) &&
    Boolean(me.data) &&
    detail?.status === "HUMAN_HANDLING" &&
    detail?.assignedHumanAgent?.id === me.data?.id;
  const canClaim =
    scope === "unassigned" && detail?.status === "ESCALATED" && me.data?.role === "HUMAN_AGENT";
  const canTakeover = scope === "ai-live" && detail?.status === "AI_HANDLING" && isAdmin;
  const canAssign = scope === "unassigned" && detail?.status === "ESCALATED" && isAdmin;
  const availableHumanAgents =
    humanAgents.data?.users.filter((user) => user.role === "HUMAN_AGENT") ?? [];

  const timeline = detail
    ? [
        {
          createdAt: detail.webSession.createdAt,
          description: { text: "Session created." },
          id: "web-session",
        },
        ...detail.aiActivities.map((activity) => ({
          createdAt: activity.createdAt,
          description: describeActivity(activity),
          id: activity.id,
        })),
      ]
    : [];
  const images =
    detail?.messages.flatMap((message) =>
      message.attachments
        .filter(isImage)
        .map((attachment) => ({ attachment, messagePosition: message.position })),
    ) ?? [];

  return (
    <PlatformAppShell fullBleed>
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 overflow-hidden",
          infoPanelOpen && detail
            ? "md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]"
            : "md:grid-cols-[20rem_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-r",
            ticketId && "hidden md:flex",
          )}
        >
          <div className="border-b px-2">
            <nav className="flex items-center gap-1">
              <Link
                className={cn(
                  "flex h-9 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors",
                  scope === "mine"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                to="/chat"
              >
                Mine
                {scopeUnreadTotal(mineTickets.data) > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">
                    {scopeUnreadTotal(mineTickets.data)}
                  </span>
                ) : null}
              </Link>
              <Link
                className={cn(
                  "flex h-9 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors",
                  scope === "unassigned"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                to="/chat/unassigned"
              >
                Unassigned
                {scopeUnreadTotal(unassignedTickets.data) > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">
                    {scopeUnreadTotal(unassignedTickets.data)}
                  </span>
                ) : null}
              </Link>
              <Link
                className={cn(
                  "flex h-9 items-center border-b-2 px-2 text-[13px] font-medium transition-colors",
                  scope === "all"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                to="/chat/all"
              >
                All
              </Link>
            </nav>
          </div>
          <p className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            {scope === "unassigned"
              ? "Escalated Tickets waiting to be claimed"
              : scope === "ai-live"
                ? "Tickets currently handled by the AI Agent"
                : scope === "all"
                  ? "Every Ticket you can see, including Resolved"
                  : "Tickets assigned to you"}
          </p>
          <div className="border-b p-2.5">
            <div className="flex items-center gap-1.5">
              <InputGroup className="flex-1">
                <InputGroupInput
                  aria-label="Search Tickets by customer name"
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
              {scope === "all" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label="Filter Tickets"
                      className="relative size-9 shrink-0"
                      size="icon"
                      variant="outline"
                    >
                      <SlidersHorizontalIcon className="size-4" />
                      {activeFilterCount > 0 ? (
                        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium leading-none text-primary-foreground tabular-nums">
                          {activeFilterCount}
                        </span>
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1.5">
                    <FilterGroup
                      activeValue={statusFilter ?? "ALL"}
                      label="Status"
                      onToggle={(value) => setListFilter("status", value)}
                      options={statusFilterOptions}
                    />
                    <FilterGroup
                      activeValue={priorityFilter ?? "ALL"}
                      label="Priority"
                      onToggle={(value) => setListFilter("priority", value)}
                      options={priorityFilterOptions}
                    />
                    <FilterGroup
                      activeValue={categoryFilter ?? "ALL"}
                      label="Category"
                      onToggle={(value) => setListFilter("category", value)}
                      options={categoryFilterOptions}
                    />
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
            {scope === "all" && activeFilters.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {activeFilters.map((filter) => (
                  <button
                    aria-label={`Remove ${filter.label} filter`}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-1 pl-2 text-[11px] leading-4 font-medium hover:bg-accent"
                    key={filter.key}
                    onClick={() => setListFilter(filter.key, undefined)}
                    type="button"
                  >
                    {filter.label}
                    <XIcon className="size-3 text-muted-foreground" />
                  </button>
                ))}
                <button
                  className="px-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                  onClick={() => {
                    setListFilter("status", undefined);
                    setListFilter("priority", undefined);
                    setListFilter("category", undefined);
                  }}
                  type="button"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {scope === "all" ? (
              <>
                {allTickets.isPending ? (
                  <div className="grid gap-1.5 p-1">
                    <Skeleton className="h-[4.25rem] w-full" />
                    <Skeleton className="h-[4.25rem] w-full" />
                    <Skeleton className="h-[4.25rem] w-full" />
                  </div>
                ) : null}
                {allTickets.isError ? (
                  <p className="p-4 text-center text-xs text-destructive">
                    Unable to load Tickets.
                  </p>
                ) : null}
                {allTickets.data && allTicketRows.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No Tickets match this search and filter.
                  </p>
                ) : null}
                <div className="flex flex-col gap-0.5">
                  {allTicketRows.map((row) => (
                    <AllTicketRow
                      key={row.id}
                      active={row.id === ticketId}
                      onSelect={() =>
                        void navigate({
                          params: { ticketId: row.id },
                          search: (prev) => prev,
                          to: scopeRoutes.all.ticket,
                        })
                      }
                      ticket={row}
                    />
                  ))}
                </div>
                {allTickets.hasNextPage ? (
                  <Button
                    className="mt-2 w-full"
                    disabled={allTickets.isFetchingNextPage}
                    onClick={() => void allTickets.fetchNextPage()}
                    size="sm"
                    variant="outline"
                  >
                    {allTickets.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {tickets.isPending ? (
                  <div className="grid gap-1.5 p-1">
                    <Skeleton className="h-[4.25rem] w-full" />
                    <Skeleton className="h-[4.25rem] w-full" />
                    <Skeleton className="h-[4.25rem] w-full" />
                  </div>
                ) : null}
                {tickets.isError ? (
                  <p className="p-4 text-center text-xs text-destructive">
                    Unable to load your Tickets.
                  </p>
                ) : null}
                {tickets.data && rows?.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {tickets.data.tickets.length === 0
                      ? scope === "unassigned"
                        ? "No escalated Tickets are waiting."
                        : scope === "ai-live"
                          ? "No Tickets are currently handled by the AI Agent."
                          : "No Tickets are assigned to you yet. Claim one from Unassigned to see it here."
                      : "No Tickets match this search."}
                  </p>
                ) : null}
                <div className="flex flex-col gap-0.5">
                  {rows?.map((row) => (
                    <TicketRow
                      key={row.id}
                      active={row.id === ticketId}
                      onSelect={() =>
                        void navigate({
                          params: { ticketId: row.id },
                          search: (prev) => prev,
                          to: scopeRoutes[scope].ticket,
                        })
                      }
                      ticket={row}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
        <section
          className={cn("flex min-h-0 flex-col overflow-hidden", !ticketId && "hidden md:flex")}
        >
          {reconnecting ? (
            <p className="border-b bg-muted p-2 text-center text-xs text-muted-foreground">
              Reconnecting…
            </p>
          ) : null}
          {claim.isError ? (
            <p className="border-b p-3 text-center text-xs text-destructive">
              {claim.error instanceof Error
                ? claim.error.message
                : "This Ticket was just claimed by another Human Agent."}
            </p>
          ) : null}
          {takeover.isError ? (
            <p className="border-b p-3 text-center text-xs text-destructive">
              {takeover.error instanceof Error
                ? takeover.error.message
                : "This Ticket is no longer handled by the AI Agent."}
            </p>
          ) : null}
          {reassign.isError ? (
            <p className="border-b p-3 text-center text-xs text-destructive">
              {reassign.error instanceof Error
                ? reassign.error.message
                : "Failed to assign the Ticket."}
            </p>
          ) : null}
          {!ticketId ? (
            <Empty className="m-auto border-0">
              <EmptyTitle>Select a Ticket</EmptyTitle>
              <EmptyDescription>Choose a Ticket from Mine to view its transcript.</EmptyDescription>
            </Empty>
          ) : null}
          {ticketId && ticket.isPending ? (
            <div className="grid gap-3 p-6">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          ) : null}
          {ticketId && ticket.isError ? (
            <Empty className="m-auto border-0">
              <EmptyTitle>Unable to load this Ticket</EmptyTitle>
              <EmptyDescription>
                It may not exist, or you may not have access to it.
              </EmptyDescription>
            </Empty>
          ) : null}
          {detail ? (
            <>
              <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Link
                    aria-label="Back to Ticket list"
                    className="shrink-0 md:hidden"
                    to={scopeRoutes[scope].list}
                  >
                    <ArrowLeftIcon className="size-4" />
                  </Link>
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs">
                      {getInitials(detail.customerIdentity.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm leading-5 font-semibold">
                      {detail.customerIdentity.name}
                    </p>
                    <p className="truncate text-xs leading-4 text-muted-foreground">
                      {detail.title}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <StatusBadge status={detail.status} />
                  <PriorityBadge priority={detail.priority} />
                  <Badge className="px-1.5" variant="outline">
                    {formatEnumLabel(detail.category)}
                  </Badge>
                  {canClaim ? (
                    <Button
                      disabled={claim.isPending}
                      onClick={() => ticketId && claim.mutate(ticketId)}
                      size="sm"
                    >
                      {claim.isPending ? "Claiming…" : "Claim"}
                    </Button>
                  ) : null}
                  {canTakeover ? (
                    <Button
                      disabled={takeover.isPending}
                      onClick={() => ticketId && takeover.mutate(ticketId)}
                      size="sm"
                    >
                      {takeover.isPending ? "Taking over…" : "Take over"}
                    </Button>
                  ) : null}
                  {canAssign ? (
                    <>
                      <Select onValueChange={setAssigneeId} value={assigneeId}>
                        <SelectTrigger
                          aria-label="Assign to a Human Agent"
                          className="w-40"
                          size="sm"
                        >
                          <SelectValue placeholder="Assign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableHumanAgents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={!assigneeId || reassign.isPending}
                        onClick={() =>
                          ticketId &&
                          assigneeId &&
                          reassign.mutate(
                            { humanAgentId: assigneeId, id: ticketId },
                            { onSuccess: () => setAssigneeId(undefined) },
                          )
                        }
                        size="sm"
                      >
                        {reassign.isPending ? "Assigning…" : "Assign"}
                      </Button>
                    </>
                  ) : null}
                  <InputGroupButton
                    className="hidden xl:inline-flex"
                    size="icon-sm"
                    aria-label={infoPanelOpen ? "Hide Ticket details" : "Show Ticket details"}
                    onClick={() => setInfoPanelOpen((open) => !open)}
                  >
                    <UserRoundIcon />
                  </InputGroupButton>
                  <InputGroupButton
                    className="xl:hidden"
                    size="icon-sm"
                    aria-label="Show Ticket details"
                    onClick={() => setInspectorSheetOpen(true)}
                  >
                    <UserRoundIcon />
                  </InputGroupButton>
                </div>
              </header>
              <MessageScroller>
                <MessageScrollerContent className="gap-4 bg-muted/40 px-4 py-4">
                  {detail.messages.map((message) => (
                    <div key={message.id}>
                      <TranscriptMessage
                        message={message}
                        onRetry={() =>
                          ticketId && retryReply.mutate({ id: ticketId, messageId: message.id })
                        }
                        onOpenImage={(attachment) =>
                          setGalleryIndex(
                            images.findIndex((image) => image.attachment.id === attachment.id),
                          )
                        }
                      />
                    </div>
                  ))}
                </MessageScrollerContent>
              </MessageScroller>
              <div className="shrink-0 border-t bg-background p-2.5">
                {canReply ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const content = draft.trim();
                      if ((!content && !files.length) || !ticketId) return;
                      const input = {
                        content,
                        id: ticketId,
                        idempotencyKey: (replyKey.current ??= crypto.randomUUID()),
                      };
                      const onSuccess = () =>
                        setDraft((current) => {
                          if (current.trim() !== content) return current;
                          replyKey.current = undefined;
                          setFiles([]);
                          return "";
                        });
                      if (files.length) sendAttachments.mutate({ ...input, files }, { onSuccess });
                      else sendReply.mutate(input, { onSuccess });
                    }}
                  >
                    <InputGroup>
                      <InputGroupTextarea
                        aria-label="Reply to Customer"
                        onChange={(event) => {
                          replyKey.current = undefined;
                          setDraft(event.target.value);
                        }}
                        placeholder="Type your message..."
                        value={draft}
                      />
                      <InputGroupAddon align="block-start" className="flex-wrap">
                        {files.map((file, index) => (
                          <SelectedFile
                            file={file}
                            key={`${file.name}-${file.lastModified}-${index}`}
                            onRemove={() =>
                              setFiles((current) =>
                                current.filter((_, currentIndex) => currentIndex !== index),
                              )
                            }
                          />
                        ))}
                        <label
                          aria-label="Attach files"
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                        >
                          <PaperclipIcon />
                          <input
                            className="sr-only"
                            type="file"
                            multiple
                            accept={webAttachmentCapability.mimeTypes.join(",")}
                            onChange={(event) => {
                              const additions = [...(event.target.files ?? [])].filter(
                                (file) =>
                                  webAttachmentCapability.mimeTypes.includes(file.type) &&
                                  file.size > 0 &&
                                  file.size <= webAttachmentCapability.maxFileSizeBytes,
                              );
                              setFiles((current) =>
                                [...current, ...additions].slice(
                                  0,
                                  webAttachmentCapability.maxFilesPerMessage,
                                ),
                              );
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </InputGroupAddon>
                      <InputGroupAddon align="block-end">
                        <InputGroupButton
                          disabled={suggestedReply.isPending || !ticketId}
                          onClick={() =>
                            ticketId &&
                            suggestedReply.mutate(ticketId, {
                              onSuccess: ({ suggestedReply: reply }) => {
                                if (!draft.trim()) setDraft(reply.content);
                                else setSuggestedReplyContent(reply.content);
                              },
                            })
                          }
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <SparklesIcon />
                          {suggestedReply.isPending ? "Drafting…" : "Suggest reply"}
                        </InputGroupButton>
                        <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                          <AlertDialogTrigger asChild>
                            <InputGroupButton
                              disabled={sendReply.isPending || sendAttachments.isPending}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Resolve Ticket
                            </InputGroupButton>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Resolve this Ticket?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Resolution reason: Human resolved. The Customer will no longer be
                                able to receive replies here, this Ticket cannot be reopened, and
                                the transcript becomes read-only.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={resolve.isPending}
                                onClick={() =>
                                  ticketId &&
                                  resolve.mutate(ticketId, {
                                    onSuccess: () => setResolveDialogOpen(false),
                                  })
                                }
                              >
                                {resolve.isPending ? "Resolving…" : "Resolve"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <InputGroupButton
                          aria-label="Send reply"
                          className="ml-auto"
                          disabled={(!draft.trim() && !files.length) || sendAttachments.isPending}
                          size="icon-sm"
                          type="submit"
                          variant="default"
                        >
                          <SendIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    {sendReply.isError ||
                    sendAttachments.isError ||
                    suggestedReply.isError ||
                    resolve.isError ? (
                      <p className="text-xs text-destructive">
                        {resolve.isError
                          ? "Finish or retry the pending reply before resolving this Ticket."
                          : "Something went wrong updating this Ticket. Please try again."}
                      </p>
                    ) : null}
                    <AlertDialog
                      open={Boolean(suggestedReplyContent)}
                      onOpenChange={(open) => !open && setSuggestedReplyContent(undefined)}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Suggested Reply is ready</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your current draft will not be overwritten. Replace it or insert the
                            Suggested Reply below it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep current draft</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setDraft(`${draft}\n\n${suggestedReplyContent}`);
                              setSuggestedReplyContent(undefined);
                            }}
                          >
                            Insert below
                          </AlertDialogAction>
                          <AlertDialogAction
                            onClick={() => {
                              setDraft(suggestedReplyContent ?? "");
                              setSuggestedReplyContent(undefined);
                            }}
                          >
                            Replace draft
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </form>
                ) : (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    {detail.status === "RESOLVED"
                      ? "This Ticket is resolved. The transcript is read-only."
                      : "You don't currently own this Ticket."}
                  </p>
                )}
              </div>
              <ImageGallery
                images={images}
                index={galleryIndex}
                onOpenChange={(open) => !open && setGalleryIndex(null)}
                setIndex={setGalleryIndex}
              />
            </>
          ) : null}
        </section>
        {infoPanelOpen && detail ? (
          <aside className="hidden min-h-0 flex-col overflow-y-auto border-l xl:flex">
            <TicketInspector
              detail={detail}
              detailsTab={detailsTab}
              images={images}
              setDetailsTab={setDetailsTab}
              setGalleryIndex={setGalleryIndex}
              timeline={timeline}
            />
          </aside>
        ) : null}
        {detail ? (
          <Sheet onOpenChange={setInspectorSheetOpen} open={inspectorSheetOpen}>
            <SheetContent className="flex flex-col gap-0 p-0 xl:hidden">
              <SheetHeader className="border-b">
                <SheetTitle>Ticket details</SheetTitle>
              </SheetHeader>
              <TicketInspector
                detail={detail}
                detailsTab={detailsTab}
                images={images}
                setDetailsTab={setDetailsTab}
                setGalleryIndex={setGalleryIndex}
                timeline={timeline}
              />
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </PlatformAppShell>
  );
};

export default ChatView;
