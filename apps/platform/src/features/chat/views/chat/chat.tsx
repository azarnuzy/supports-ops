import type { SupportTicket, TicketAttachment, TicketDetailMessage } from "@repo/api-client";
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
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { MessageScroller, MessageScrollerContent } from "@repo/ui/components/message-scroller";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  FlagIcon,
  HistoryIcon,
  MailIcon,
  SendIcon,
  SparklesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
import { meQueryOptions } from "../../../auth";
import { describeActivity } from "../../../tickets/activity-description";
import {
  myTicketsQueryOptions,
  ticketDetailQueryOptions,
  useGenerateSuggestedReplyMutation,
  useResolveHumanTicketMutation,
  useRetryHumanReplyMutation,
  useSendHumanReplyMutation,
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

const ChatView = ({ ticketId }: { ticketId?: string }) => {
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const tickets = useQuery(myTicketsQueryOptions);
  const ticket = useQuery({
    ...ticketDetailQueryOptions(ticketId ?? ""),
    enabled: Boolean(ticketId),
  });
  useTicketEvents();

  const sendReply = useSendHumanReplyMutation();
  const suggestedReply = useGenerateSuggestedReplyMutation();
  const resolve = useResolveHumanTicketMutation();
  const retryReply = useRetryHumanReplyMutation();

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [detailsTab, setDetailsTab] = useState<"details" | "attachments" | "activity">("details");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [suggestedReplyContent, setSuggestedReplyContent] = useState<string>();
  const replyKey = useRef<string | undefined>(undefined);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  // Entering a populated Mine scope selects the first Ticket so the workspace
  // never opens on an arbitrary blank state.
  useEffect(() => {
    if (ticketId || !tickets.data) return;
    const first = tickets.data.tickets[0];
    if (first) {
      void navigate({
        params: { ticketId: first.id },
        replace: true,
        to: "/chat/tickets/$ticketId",
      });
    }
  }, [navigate, ticketId, tickets.data]);

  const rows = tickets.data?.tickets.filter((row) =>
    row.customerIdentity.name.toLowerCase().includes(search.toLowerCase()),
  );

  const detail = ticket.data?.ticket;
  const canReply =
    Boolean(detail) &&
    Boolean(me.data) &&
    detail?.status === "HUMAN_HANDLING" &&
    detail?.assignedHumanAgent?.id === me.data?.id;

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
        <aside className="flex min-h-0 flex-col border-r">
          <div className="border-b p-4">
            <p className="text-lg font-semibold">Mine</p>
            <p className="text-xs text-muted-foreground">Tickets assigned to you</p>
          </div>
          <div className="border-b p-3">
            <InputGroup>
              <InputGroupInput
                placeholder="Search by customer name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                  ? "No Tickets are assigned to you yet. Claim one from the Shared Human Queue to see it here."
                  : "No Tickets match this search."}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {rows?.map((row) => (
                <TicketRow
                  key={row.id}
                  active={row.id === ticketId}
                  onSelect={() =>
                    void navigate({ params: { ticketId: row.id }, to: "/chat/tickets/$ticketId" })
                  }
                  ticket={row}
                />
              ))}
            </div>
          </div>
        </aside>
        <section className="flex min-h-0 flex-col">
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
                  <InputGroupButton
                    size="icon-sm"
                    aria-label={infoPanelOpen ? "Hide Ticket details" : "Show Ticket details"}
                    onClick={() => setInfoPanelOpen((open) => !open)}
                  >
                    <UserRoundIcon />
                  </InputGroupButton>
                </div>
              </header>
              <MessageScroller>
                <MessageScrollerContent>
                  {detail.messages.map((message) => (
                    <TranscriptMessage
                      key={message.id}
                      message={message}
                      onRetry={() => ticketId && retryReply.mutate({ id: ticketId, messageId: message.id })}
                      onOpenImage={(attachment) =>
                        setGalleryIndex(images.findIndex((image) => image.attachment.id === attachment.id))
                      }
                    />
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
                      if (!content || !ticketId) return;
                      sendReply.mutate(
                        { content, id: ticketId, idempotencyKey: (replyKey.current ??= crypto.randomUUID()) },
                        {
                          onSuccess: () =>
                            setDraft((current) => {
                              if (current.trim() !== content) return current;
                              replyKey.current = undefined;
                              return "";
                            }),
                        },
                      );
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
                              disabled={sendReply.isPending}
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
                          disabled={!draft.trim()}
                          size="icon-sm"
                          type="submit"
                          variant="default"
                        >
                          <SendIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    {sendReply.isError || suggestedReply.isError || resolve.isError ? (
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
                    <DetailRow
                      icon={FlagIcon}
                      label="Escalation reason"
                      value={detail.escalationReason}
                    />
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
                        value={
                          detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString() : "—"
                        }
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
          </aside>
        ) : null}
      </div>
    </PlatformAppShell>
  );
};

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
          <small className="shrink-0 text-muted-foreground">
            {new Date(ticket.createdAt).toLocaleDateString()}
          </small>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {lastMessage?.content ?? ticket.title}
        </span>
      </span>
    </button>
  );
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

function AttachmentCard({
  attachment,
  onOpenImage,
}: {
  attachment: TicketAttachment;
  onOpenImage: () => void;
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
      ? "AI readability is processing; the original file is available."
      : attachment.processingStatus === "FAILED"
        ? `AI could not read this file${attachment.failureReason ? `: ${attachment.failureReason}` : "."} The original file is available.`
        : "AI-readable.";

  if (isImage(attachment)) {
    return (
      <button
        aria-label={`Open ${attachment.fileName} in gallery`}
        className="relative aspect-square overflow-hidden rounded-md border bg-muted"
        onClick={onOpenImage}
        type="button"
      >
        {previewUrl ? (
          <img alt="" className="size-full object-cover" src={previewUrl} />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">Loading…</span>
        )}
        {attachment.processingStatus !== "READY" ? (
          <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 text-[10px] text-foreground">
            {attachment.processingStatus === "PROCESSING" ? "AI reading…" : "AI unreadable"}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <article className="flex items-center gap-3 rounded-md border p-3">
      <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)} · {readability}</p>
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
          <BubbleContent>{message.content}</BubbleContent>
        </Bubble>
        {message.attachments.length ? (
          <MessageAttachments attachments={message.attachments} onOpenImage={onOpenImage} />
        ) : null}
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
}: {
  attachments: TicketAttachment[];
  onOpenImage: (attachment: TicketAttachment) => void;
}) {
  const images = attachments.filter(isImage);
  const otherAttachments = attachments.filter((attachment) => !isImage(attachment));
  return (
    <div className="mt-2 grid max-w-sm gap-1.5">
      {images.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {images.slice(0, 4).map((attachment, index) => (
            <div className="relative" key={attachment.id}>
              <AttachmentCard attachment={attachment} onOpenImage={() => onOpenImage(attachment)} />
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
        <AttachmentCard attachment={attachment} key={attachment.id} onOpenImage={() => onOpenImage(attachment)} />
      ))}
    </div>
  );
}

export default ChatView;
