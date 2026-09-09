import type {
  SupportTicket,
  TicketAttachment,
  TicketDetail,
  TicketDetailMessage,
  TicketListItem,
  TicketStatus,
} from "@repo/api-client";
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
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { Dialog, DialogContent, DialogTitle } from "@repo/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@repo/ui/components/input-group";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@repo/ui/components/item";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import { Markdown } from "@repo/ui/components/markdown";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
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
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  FlagIcon,
  HistoryIcon,
  MailIcon,
  SendIcon,
  PaperclipIcon,
  SparklesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
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
  useIsElementVisible,
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
import { getAttachmentPreviewUrl, openAttachment } from "../../../tickets/tickets.services";

function senderName(message: TicketDetailMessage) {
  if (message.senderType === "CUSTOMER") return "Customer";
  if (message.senderType === "AI_AGENT") return "AI Agent";
  if (message.senderType === "HUMAN_AGENT") return "Human Agent";
  return "System";
}

function bubbleVariant(senderType: TicketDetailMessage["senderType"]) {
  if (senderType === "AI_AGENT") return "ai" as const;
  if (senderType === "HUMAN_AGENT") return "human" as const;
  return "customer" as const;
}

type TicketScope = "mine" | "unassigned" | "ai-live" | "all";

const scopeRoutes = {
  "ai-live": { list: "/chat/ai-live" as const, ticket: "/chat/ai-live/tickets/$ticketId" as const },
  all: { list: "/chat/all" as const, ticket: "/chat/all/tickets/$ticketId" as const },
  mine: { list: "/chat" as const, ticket: "/chat/tickets/$ticketId" as const },
  unassigned: {
    list: "/chat/unassigned" as const,
    ticket: "/chat/unassigned/tickets/$ticketId" as const,
  },
};

const statusFilterOptions: { label: string; value: TicketStatus | "ALL" }[] = [
  { label: "All statuses", value: "ALL" },
  { label: "AI handling", value: "AI_HANDLING" },
  { label: "Escalated", value: "ESCALATED" },
  { label: "Human handling", value: "HUMAN_HANDLING" },
  { label: "Resolved", value: "RESOLVED" },
];

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
  const [lastMessageNode, setLastMessageNode] = useState<HTMLDivElement | null>(null);
  const newestMessageVisible = useIsElementVisible(lastMessageNode);
  useMarkTicketReadOnView(ticket.data?.ticket, newestMessageVisible);

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
  const statusFilter = (routeSearch.status as TicketStatus | undefined) ?? "ALL";
  const currentLocation = ticketId
    ? { params: { ticketId }, to: scopeRoutes[scope].ticket }
    : { to: scopeRoutes[scope].list };
  const setSearch = (value: string) =>
    void navigate({
      ...currentLocation,
      replace: true,
      search: (prev: { q?: string; status?: string }) => ({ ...prev, q: value || undefined }),
    });
  const setStatusFilter = (value: TicketStatus | "ALL") =>
    void navigate({
      ...currentLocation,
      replace: true,
      search: (prev: { q?: string; status?: string }) => ({
        ...prev,
        status: value === "ALL" ? undefined : value,
      }),
    });
  const allTickets = useAllTicketsQuery({
    enabled: scope === "all",
    search: scope === "all" ? search || undefined : undefined,
    status: scope === "all" && statusFilter !== "ALL" ? [statusFilter] : undefined,
  });
  const allTicketRows = allTickets.data?.pages.flatMap((page) => page.tickets) ?? [];
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"details" | "attachments" | "activity">("details");
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
  const availableHumanAgents = humanAgents.data?.users.filter((user) => user.role === "HUMAN_AGENT") ?? [];

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
        <aside className={cn("flex min-h-0 flex-col border-r", ticketId && "hidden md:flex")}>
          <div className="border-b p-4">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <Link className={scope === "mine" ? "text-foreground" : "text-muted-foreground"} to="/chat">
                Mine
              </Link>
              {scopeUnreadTotal(mineTickets.data) > 0 ? (
                <Badge className="px-1.5">{scopeUnreadTotal(mineTickets.data)}</Badge>
              ) : null}
              <Link
                className={scope === "unassigned" ? "text-foreground" : "text-muted-foreground"}
                to="/chat/unassigned"
              >
                Unassigned
              </Link>
              {scopeUnreadTotal(unassignedTickets.data) > 0 ? (
                <Badge className="px-1.5">{scopeUnreadTotal(unassignedTickets.data)}</Badge>
              ) : null}
              {isAdmin ? (
                <Link
                  className={scope === "ai-live" ? "text-foreground" : "text-muted-foreground"}
                  to="/chat/ai-live"
                >
                  AI-handled
                </Link>
              ) : null}
              <Link
                className={scope === "all" ? "text-foreground" : "text-muted-foreground"}
                to="/chat/all"
              >
                All
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              {scope === "unassigned"
                ? "Escalated Tickets waiting to be claimed"
                : scope === "ai-live"
                  ? "Tickets currently handled by the AI Agent"
                  : scope === "all"
                    ? "Every Ticket you can see, including Resolved"
                    : "Tickets assigned to you"}
            </p>
          </div>
          <div className="border-b p-3">
            <InputGroup>
              <InputGroupInput
                aria-label="Search Tickets by customer name"
                placeholder="Search by customer name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            {scope === "all" ? (
              <Select onValueChange={(value) => setStatusFilter(value as TicketStatus | "ALL")} value={statusFilter}>
                <SelectTrigger aria-label="Filter by status" className="mt-2 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {scope === "all" ? (
              <>
                {allTickets.isPending ? (
                  <div className="grid gap-2 p-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
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
                  <div className="grid gap-2 p-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
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
        <section className={cn("flex min-h-0 flex-col", !ticketId && "hidden md:flex")}>
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
              <header className="flex items-center justify-between gap-3 border-b p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    aria-label="Back to Ticket list"
                    className="shrink-0 md:hidden"
                    to={scopeRoutes[scope].list}
                  >
                    <ArrowLeftIcon className="size-5" />
                  </Link>
                  <Avatar>
                    <AvatarFallback>{getInitials(detail.customerIdentity.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{detail.customerIdentity.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{detail.title}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <StatusBadge status={detail.status} />
                  <PriorityBadge priority={detail.priority} />
                  <Badge variant="outline">{detail.category}</Badge>
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
                        <SelectTrigger aria-label="Assign to a Human Agent" className="w-40" size="sm">
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
                <MessageScrollerContent>
                  {detail.messages.map((message, index) => (
                    <div
                      key={message.id}
                      ref={index === detail.messages.length - 1 ? setLastMessageNode : undefined}
                    >
                      <TranscriptMessage
                        message={message}
                        onRetry={() => ticketId && retryReply.mutate({ id: ticketId, messageId: message.id })}
                        onOpenImage={(attachment) =>
                          setGalleryIndex(images.findIndex((image) => image.attachment.id === attachment.id))
                        }
                      />
                    </div>
                  ))}
                </MessageScrollerContent>
              </MessageScroller>
              <div className="border-t p-3">
                {canReply ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const content = draft.trim();
                      if ((!content && !files.length) || !ticketId) return;
                      const input = { content, id: ticketId, idempotencyKey: (replyKey.current ??= crypto.randomUUID()) };
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
                            onRemove={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                          />
                        ))}
                        <label aria-label="Attach files" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                            <PaperclipIcon />
                            <input
                              className="sr-only"
                              type="file"
                              multiple
                              accept={webAttachmentCapability.mimeTypes.join(",")}
                              onChange={(event) => {
                                const additions = [...event.target.files].filter(
                                  (file) => webAttachmentCapability.mimeTypes.includes(file.type) && file.size > 0 && file.size <= webAttachmentCapability.maxFileSizeBytes,
                                );
                                setFiles((current) => [...current, ...additions].slice(0, webAttachmentCapability.maxFilesPerMessage));
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
                    {sendReply.isError || sendAttachments.isError || suggestedReply.isError || resolve.isError ? (
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

function TicketInspector({
  detail,
  detailsTab,
  images,
  setDetailsTab,
  setGalleryIndex,
  timeline,
}: {
  detail: TicketDetail;
  detailsTab: "details" | "attachments" | "activity";
  images: { attachment: TicketAttachment; messagePosition: number }[];
  setDetailsTab: (value: "details" | "attachments" | "activity") => void;
  setGalleryIndex: (index: number) => void;
  timeline: { createdAt: string; description: { mono?: string; text: string }; id: string }[];
}) {
  return (
    <Tabs
      value={detailsTab}
      onValueChange={(value) => setDetailsTab(value as typeof detailsTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList className="mx-3 mt-3 w-[calc(100%-1.5rem)]">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="attachments">Attachments</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      {detailsTab === "details" ? (
        <div className="flex flex-col gap-1 p-3">
          <DetailRow icon={MailIcon} label="Email" value={detail.customerIdentity.email} />
          <DetailRow
            icon={UserRoundIcon}
            label="Owner"
            value={detail.assignedHumanAgent?.name ?? "Unassigned"}
          />
          <DetailRow icon={FlagIcon} label="Priority" value={detail.priority} />
          <DetailRow icon={CalendarIcon} label="Category" value={detail.category} />
          {detail.escalationReason ? (
            <DetailRow icon={FlagIcon} label="Escalation reason" value={detail.escalationReason} />
          ) : null}
          {detail.escalationSummaryStatus === "PENDING" ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Preparing the Escalation Summary…
            </p>
          ) : null}
          {detail.escalationSummaryStatus === "FAILED" ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              The Escalation Summary could not be generated.
            </p>
          ) : null}
          {detail.escalationSummaryStatus === "READY" && detail.escalationSummary ? (
            <article className="mx-2 mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
              {detail.escalationSummary}
            </article>
          ) : null}
          {detail.status === "RESOLVED" ? (
            <>
              <DetailRow
                icon={FlagIcon}
                label="Resolution reason"
                value={detail.resolutionReason ?? "—"}
              />
              <DetailRow
                icon={CalendarIcon}
                label="Resolved at"
                value={detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString() : "—"}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {detailsTab === "attachments" ? (
        <div className="grid gap-2 p-3">
          {detail.messages.flatMap((message) => message.attachments).length ? (
            detail.messages.flatMap((message) =>
              message.attachments.map((attachment) => (
                <AttachmentCard
                  attachment={attachment}
                  key={attachment.id}
                  onOpenImage={() =>
                    setGalleryIndex(images.findIndex((image) => image.attachment.id === attachment.id))
                  }
                />
              )),
            )
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground">No Attachments yet.</p>
          )}
        </div>
      ) : null}
      {detailsTab === "activity" ? (
        timeline.length === 0 ? (
          <Empty className="border-0 p-6">
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
          </Empty>
        ) : (
          <ol className="grid gap-3 p-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <span>
                  {entry.description.text}
                  {entry.description.mono ? (
                    <>
                      {" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        {entry.description.mono}
                      </code>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Tabs>
  );
}

function TicketRow({
  active,
  onSelect,
  ticket,
}: {
  active: boolean;
  onSelect: () => void;
  ticket: SupportTicket;
}) {
  const lastMessage = ticket.messages.at(-1);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 rounded-lg p-3 text-left hover:bg-accent",
        active ? "bg-accent" : "",
      )}
    >
      <Avatar>
        <AvatarFallback>{getInitials(ticket.customerIdentity.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-2">
          <b className="truncate text-sm">{ticket.customerIdentity.name}</b>
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <small>{new Date(ticket.createdAt).toLocaleDateString()}</small>
            {ticket.unreadCount > 0 ? (
              <Badge aria-label={`${ticket.unreadCount} unread`} className="px-1.5" variant="default">
                {ticket.unreadCount}
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {lastMessage?.content ?? ticket.title}
        </span>
        <span className="mt-2 flex items-center gap-1.5">
          <PriorityBadge priority={ticket.priority} />
          <Badge variant="outline">{ticket.category}</Badge>
          {ticket.status === "ESCALATED" ? (
            <small className="text-muted-foreground">
              Waiting {formatWaitingDuration(ticket.escalatedAt ?? ticket.createdAt)}
            </small>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function scopeUnreadTotal(data: { tickets: SupportTicket[] } | undefined) {
  return data?.tickets.reduce((total, ticket) => total + ticket.unreadCount, 0) ?? 0;
}

function AllTicketRow({
  active,
  onSelect,
  ticket,
}: {
  active: boolean;
  onSelect: () => void;
  ticket: TicketListItem;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 rounded-lg p-3 text-left hover:bg-accent",
        active ? "bg-accent" : "",
      )}
    >
      <Avatar>
        <AvatarFallback>{getInitials(ticket.customerIdentity.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-2">
          <b className="truncate text-sm">{ticket.customerIdentity.name}</b>
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <small>{new Date(ticket.updatedAt).toLocaleDateString()}</small>
            {ticket.unreadCount > 0 ? (
              <Badge aria-label={`${ticket.unreadCount} unread`} className="px-1.5" variant="default">
                {ticket.unreadCount}
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{ticket.title}</span>
        <span className="mt-2 flex items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <Badge variant="outline">{ticket.category}</Badge>
          {ticket.assignedHumanAgent ? (
            <small className="truncate text-muted-foreground">{ticket.assignedHumanAgent.name}</small>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function formatWaitingDuration(since: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MailIcon;
  label: string;
  value: string;
}) {
  return (
    <Item size="sm" className="px-2 py-1.5">
      <ItemMedia>
        <Icon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle className="text-xs font-normal text-muted-foreground">{label}</ItemTitle>
        <p className="truncate text-sm">{value}</p>
      </ItemContent>
    </Item>
  );
}

function isImage(attachment: TicketAttachment) {
  return attachment.mimeType === "image/jpeg" || attachment.mimeType === "image/png";
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = sizeBytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function SelectedFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="flex min-w-0 max-w-48 items-center gap-2 rounded-md bg-muted p-1.5 text-xs text-foreground">
      {previewUrl ? <img alt="" className="size-8 rounded object-cover" src={previewUrl} /> : <FileTextIcon className="size-5 shrink-0" />}
      <span className="truncate">{file.name}</span>
      <button aria-label={`Remove ${file.name}`} onClick={onRemove} type="button"><XIcon className="size-3.5" /></button>
    </div>
  );
}

function AttachmentCard({
  attachment,
  onOpenImage,
  showReadability = true,
}: {
  attachment: TicketAttachment;
  onOpenImage: () => void;
  showReadability?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const isPreviewableDocument =
    attachment.mimeType === "application/pdf" || attachment.mimeType === "text/plain";

  useEffect(() => {
    if (!isImage(attachment)) return;
    void getAttachmentPreviewUrl(attachment.id).then(({ url }) => setPreviewUrl(url));
  }, [attachment]);

  const readability =
    attachment.processingStatus === "PROCESSING"
      ? "AI reading…"
      : attachment.processingStatus === "FAILED"
        ? `Could not be read${attachment.failureReason ? `: ${attachment.failureReason}` : ""}`
        : "✓";

  if (isImage(attachment)) {
    return (
      <button
        aria-label={`Open ${attachment.fileName} in gallery`}
        className="relative size-28 shrink-0 overflow-hidden rounded-md border bg-muted"
        onClick={onOpenImage}
        type="button"
      >
        {previewUrl ? (
          <img alt="" className="size-full object-cover" src={previewUrl} />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">Loading…</span>
        )}
        {showReadability ? (
          <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 text-[10px] text-foreground">
            {readability}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <article className="flex min-w-0 items-center gap-3 rounded-md border p-3">
      <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}{showReadability ? ` · ${readability}` : ""}</p>
      </div>
      {isPreviewableDocument ? (
        <Button onClick={() => void getAttachmentPreviewUrl(attachment.id).then(({ url }) => window.open(url, "_blank", "noopener"))} size="xs" type="button" variant="outline">
          Preview
        </Button>
      ) : null}
      {isPreviewableDocument ? (
        <Button aria-label={`Download ${attachment.fileName}`} onClick={() => void openAttachment(attachment.id)} size="icon-xs" type="button" variant="outline">
          <DownloadIcon />
        </Button>
      ) : null}
    </article>
  );
}

function ImageGallery({
  images,
  index,
  onOpenChange,
  setIndex,
}: {
  images: { attachment: TicketAttachment; messagePosition: number }[];
  index: number | null;
  onOpenChange: (open: boolean) => void;
  setIndex: (index: number) => void;
}) {
  const image = index === null ? null : images[index];
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    setUrl(undefined);
    if (image) void getAttachmentPreviewUrl(image.attachment.id).then(({ url }) => setUrl(url));
  }, [image]);

  return (
    <Dialog open={index !== null} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-5xl bg-background p-4"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && index !== null) setIndex((index - 1 + images.length) % images.length);
          if (event.key === "ArrowRight" && index !== null) setIndex((index + 1) % images.length);
        }}
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="truncate text-sm">{image?.attachment.fileName} · {(index ?? 0) + 1} of {images.length}</DialogTitle>
          <Button aria-label="Close gallery" onClick={() => onOpenChange(false)} size="icon-sm" type="button" variant="ghost"><XIcon /></Button>
        </div>
        <div className="relative grid min-h-80 place-items-center bg-muted">
          {url ? <img alt={image?.attachment.fileName ?? ""} className="max-h-[65vh] max-w-full object-contain" src={url} /> : "Loading…"}
          {images.length > 1 && index !== null ? (
            <>
              <Button aria-label="Previous image" className="absolute left-2" onClick={() => setIndex((index - 1 + images.length) % images.length)} size="icon-sm" type="button" variant="secondary"><ChevronLeftIcon /></Button>
              <Button aria-label="Next image" className="absolute right-2" onClick={() => setIndex((index + 1) % images.length)} size="icon-sm" type="button" variant="secondary"><ChevronRightIcon /></Button>
            </>
          ) : null}
        </div>
        <div aria-label="Image filmstrip" className="flex gap-2 overflow-x-auto">
          {images.map((entry, imageIndex) => (
            <button aria-label={`View image ${imageIndex + 1}`} className={cn("size-12 shrink-0 overflow-hidden rounded border", index === imageIndex && "ring-2 ring-primary")} key={entry.attachment.id} onClick={() => setIndex(imageIndex)} type="button">
              <GalleryThumbnail attachment={entry.attachment} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GalleryThumbnail({ attachment }: { attachment: TicketAttachment }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    void getAttachmentPreviewUrl(attachment.id).then(({ url }) => setUrl(url));
  }, [attachment]);
  return url ? <img alt="" className="size-full object-cover" src={url} /> : null;
}

function TranscriptMessage({
  message,
  onRetry,
  onOpenImage,
}: {
  message: TicketDetailMessage;
  onRetry: () => void;
  onOpenImage: (attachment: TicketAttachment) => void;
}) {
  if (message.senderType === "SYSTEM") {
    return (
      <Marker>
        <MarkerContent>{message.content}</MarkerContent>
      </Marker>
    );
  }

  const isHuman = message.senderType === "HUMAN_AGENT";
  const legacyAttachmentText = /^I need help with the attached file: .+$/.test(message.content) && message.attachments.length;
  return (
    <Message align={isHuman ? "end" : "start"}>
      <MessageAvatar>
        <Avatar className="size-8">
          <AvatarFallback>{getInitials(senderName(message))}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{senderName(message)}</MessageHeader>
        <Bubble variant={bubbleVariant(message.senderType)}>
          <BubbleContent className={message.attachments.length ? "w-fit max-w-full" : undefined}>
            {message.attachments.length ? (
              <MessageAttachments attachments={message.attachments} onOpenImage={onOpenImage} showReadability={message.senderType === "CUSTOMER"} />
            ) : null}
            {message.content && !legacyAttachmentText ? (
              <div className={message.attachments.length ? "mt-2" : undefined}>
                {message.senderType === "CUSTOMER" ? message.content : <Markdown>{message.content}</Markdown>}
              </div>
            ) : null}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="flex items-center gap-1.5">
          {new Date(message.createdAt).toLocaleString()}
          {isHuman && message.deliveryStatus !== "SENT" ? (
            <span
              className={cn(
                message.deliveryStatus === "FAILED" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {message.deliveryStatus === "PENDING" ? "Sending…" : "Failed to send"}
            </span>
          ) : null}
          {isHuman && message.deliveryStatus === "FAILED" ? (
            <button className="text-xs underline" onClick={onRetry} type="button">
              Retry
            </button>
          ) : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function MessageAttachments({
  attachments,
  onOpenImage,
  showReadability = true,
}: {
  attachments: TicketAttachment[];
  onOpenImage: (attachment: TicketAttachment) => void;
  showReadability?: boolean;
}) {
  const images = attachments.filter(isImage);
  const otherAttachments = attachments.filter((attachment) => !isImage(attachment));
  const shownImages = images.slice(0, 4);
  const imageColumns = Math.min(shownImages.length, 3);
  return (
    <div className="grid w-fit max-w-sm gap-1.5">
      {images.length ? (
        <div
          className={cn(
            "grid gap-1.5",
            imageColumns === 1 ? "grid-cols-1" : imageColumns === 2 ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {shownImages.map((attachment, index) => (
            <div className="relative" key={attachment.id}>
              <AttachmentCard attachment={attachment} onOpenImage={() => onOpenImage(attachment)} showReadability={showReadability} />
              {index === 3 && images.length > 4 ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-md bg-black/60 text-sm font-semibold text-white">
                  +{images.length - 4}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {otherAttachments.map((attachment) => (
        <AttachmentCard attachment={attachment} key={attachment.id} onOpenImage={() => onOpenImage(attachment)} showReadability={showReadability} />
      ))}
    </div>
  );
}

export default ChatView;
