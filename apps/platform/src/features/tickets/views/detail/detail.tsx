import type { TicketActivity, TicketAttachment, TicketDetailMessage } from "@repo/api-client";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { MessageScroller, MessageScrollerContent } from "@repo/ui/components/message-scroller";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { useQuery } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
import { ticketDetailQueryOptions } from "../../tickets.hooks";
import { openAttachment } from "../../tickets.services";

function bubbleVariant(senderType: TicketDetailMessage["senderType"]) {
  if (senderType === "CUSTOMER") return "customer" as const;
  if (senderType === "AI_AGENT") return "ai" as const;
  if (senderType === "HUMAN_AGENT") return "human" as const;
  return "customer" as const;
}

function senderName(message: TicketDetailMessage) {
  if (message.senderType === "CUSTOMER") return "Customer";
  if (message.senderType === "AI_AGENT") return "AI Agent";
  if (message.senderType === "HUMAN_AGENT") return "Human Agent";
  return "System";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeActivity(activity: TicketActivity): { mono?: string; text: string } {
  const metadata = activity.metadata ?? {};
  switch (activity.eventType) {
    case "TICKET_CREATED":
      return { text: "Ticket created." };
    case "CLASSIFIED":
      return {
        mono: [metadata.category, metadata.priority].filter(Boolean).join(" · "),
        text: "Classified",
      };
    case "KNOWLEDGE_RETRIEVED": {
      const count = Array.isArray(metadata.chunkIds) ? metadata.chunkIds.length : 0;
      return { text: `Knowledge retrieved — ${count} chunk${count === 1 ? "" : "s"}.` };
    }
    case "TOOL_CALLED":
      return { mono: String(metadata.tool ?? ""), text: "Tool called" };
    case "TOOL_FAILED":
      return { mono: String(metadata.tool ?? ""), text: "Tool failed" };
    case "AI_REPLIED":
      return { text: "AI Agent replied." };
    case "CLARIFICATION_ASKED":
      return { text: "AI Agent asked a clarifying question." };
    case "ESCALATED":
      return { mono: String(metadata.reason ?? ""), text: "Escalated" };
    case "FOLLOW_UP_SENT":
      return { text: "Follow-up sent to the Customer." };
    case "RESOLVED":
      return { mono: String(metadata.reason ?? ""), text: "Resolved" };
    case "CLAIMED":
      return { text: "Claimed by a Human Agent." };
    case "TAKEN_OVER":
      return { text: "Taken over by an Admin." };
    case "HANDOFF_SENT":
      return { mono: String(metadata.humanAgentName ?? ""), text: "Handoff sent to" };
    case "SUMMARY_GENERATED":
      return { mono: String(metadata.outcome ?? ""), text: "Escalation summary generated" };
    case "SUGGESTED_REPLY_GENERATED":
      return { text: "Suggested reply generated." };
    case "TICKET_KNOWLEDGE_INDEXED":
      return { text: "Indexed as Ticket Knowledge." };
    case "TICKET_KNOWLEDGE_RETRIEVED":
      return { text: "Retrieved Ticket Knowledge from a previous Ticket." };
    default:
      return { text: activity.eventType.replaceAll("_", " ").toLowerCase() };
  }
}

const TicketDetailView = ({ ticketId }: { ticketId: string }) => {
  const ticket = useQuery(ticketDetailQueryOptions(ticketId));

  // The Ticket's lifecycle opens with the Web Session it was born from, then
  // the recorded AI Activity steps in creation order.
  const timeline: {
    createdAt: string;
    description: { mono?: string; text: string };
    id: string;
  }[] = ticket.data
    ? [
        {
          createdAt: ticket.data.ticket.webSession.createdAt,
          description: { text: "Session created." },
          id: "web-session",
        },
        ...ticket.data.ticket.aiActivities.map((activity) => ({
          createdAt: activity.createdAt,
          description: describeActivity(activity),
          id: activity.id,
        })),
      ]
    : [];

  return (
    <PlatformAppShell fullBleed>
      <div className="flex min-h-0 flex-1 flex-col">
        {ticket.isPending ? (
          <div className="grid gap-3 p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        ) : null}
        {ticket.isError ? (
          <Empty className="border-0 p-6">
            <EmptyTitle>Unable to load this Ticket</EmptyTitle>
            <EmptyDescription>It may not exist, or you may not have access to it.</EmptyDescription>
          </Empty>
        ) : null}
        {ticket.data ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{ticket.data.ticket.title}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {ticket.data.ticket.customerIdentity.name} ·{" "}
                  {ticket.data.ticket.customerIdentity.email}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <StatusBadge status={ticket.data.ticket.status} />
                <PriorityBadge priority={ticket.data.ticket.priority} />
                <Badge variant="outline">{ticket.data.ticket.category}</Badge>
                {ticket.data.ticket.assignedHumanAgent ? (
                  <Badge variant="secondary">{ticket.data.ticket.assignedHumanAgent.name}</Badge>
                ) : null}
              </div>
            </header>
            <Tabs defaultValue="conversation" className="min-h-0 flex-1 gap-0">
              <TabsList className="mx-4 mt-3 w-fit">
                <TabsTrigger value="conversation">Conversation</TabsTrigger>
                <TabsTrigger value="timeline">Activity timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="conversation" className="flex min-h-0 flex-1 flex-col">
                <MessageScroller>
                  <MessageScrollerContent>
                    {ticket.data.ticket.messages.map((message) => (
                      <ConversationMessage key={message.id} message={message} />
                    ))}
                  </MessageScrollerContent>
                </MessageScroller>
              </TabsContent>
              <TabsContent value="timeline" className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl p-4">
                  {timeline.length === 0 ? (
                    <Empty className="border-0">
                      <EmptyMedia variant="icon">
                        <HistoryIcon />
                      </EmptyMedia>
                      <EmptyTitle>No activity yet</EmptyTitle>
                    </Empty>
                  ) : (
                    <ol className="grid gap-3">
                      {timeline.map((entry) => {
                        const description = entry.description;
                        return (
                          <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                            <span className="w-20 shrink-0 text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleTimeString()}
                            </span>
                            <span>
                              {description.text}
                              {description.mono ? (
                                <>
                                  {" "}
                                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                                    {description.mono}
                                  </code>
                                </>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </PlatformAppShell>
  );
};

function ConversationMessage({ message }: { message: TicketDetailMessage }) {
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
        {message.attachments.length > 0 ? (
          <div className="grid gap-1.5">
            {message.attachments.map((attachment) => (
              <AttachmentItem key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}
        <MessageFooter>{new Date(message.createdAt).toLocaleString()}</MessageFooter>
      </MessageContent>
    </Message>
  );
}

function AttachmentItem({ attachment }: { attachment: TicketAttachment }) {
  const [opening, setOpening] = useState(false);
  const state =
    attachment.processingStatus === "READY"
      ? "done"
      : attachment.processingStatus === "FAILED"
        ? "error"
        : "processing";
  return (
    <button
      type="button"
      disabled={opening}
      className="block w-fit max-w-full cursor-pointer text-left"
      onClick={() => {
        setOpening(true);
        void openAttachment(attachment.id).finally(() => setOpening(false));
      }}
    >
      <Attachment state={opening ? "processing" : state}>
        <AttachmentMedia />
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>{formatBytes(attachment.sizeBytes)}</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    </button>
  );
}

export default TicketDetailView;
