import type { TicketStatus } from "@repo/api-client";
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
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  UserRoundIcon,
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
import { scopeRoutes, statusFilterOptions } from "./chat.constants";
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

export default ChatView;
