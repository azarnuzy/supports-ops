import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@repo/ui/components/input-group";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import {
  MessageScroller,
  MessageScrollerContent,
} from "@repo/ui/components/message-scroller";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BotIcon, PaperclipIcon, SendIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlatformAppShell } from "../modules/app-shell/app-shell";
import { meQueryOptions, UnauthorizedError } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/chat")({
  head: () => pageMetadata({ title: "Inbox", description: "Manage Customer conversations in your SupportOps Workspace.", path: "/chat", noIndex: true }),
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
      throw error;
    }
  },
  component: ChatPage,
});

const conversations = [
  {
    name: "Olivia Rhye",
    preview: "We're seeing 502 errors after the latest deploy.",
    time: "Now",
    unread: 4,
  },
  {
    name: "Phoenix Baker",
    preview: "I was billed twice for order #8823.",
    time: "5m",
    unread: 0,
  },
  {
    name: "Lana Steiner",
    preview: "I'm getting a 403 since the role update.",
    time: "8m",
    unread: 2,
  },
];
function ChatPage() {
  return (
    <PlatformAppShell fullBleed>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="min-h-0 border-r">
          <div className="border-b p-4">
            <p className="text-lg font-semibold">Inbox</p>
            <p className="text-xs text-muted-foreground">
              All customer conversations
            </p>
          </div>
          <div className="overflow-y-auto p-2">
            {conversations.map((conversation, index) => (
              <button
                type="button"
                key={conversation.name}
                className={`flex w-full gap-3 rounded-lg p-3 text-left hover:bg-accent ${index === 0 ? "bg-accent" : ""}`}
              >
                <Avatar>
                  <AvatarFallback>
                    {conversation.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <b className="truncate text-sm">{conversation.name}</b>
                    <small>{conversation.time}</small>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {conversation.preview}
                  </span>
                </span>
                {conversation.unread ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                    {conversation.unread}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between border-b p-4">
            <div>
              <p className="font-semibold">Olivia Rhye</p>
              <p className="font-mono text-xs text-muted-foreground">
                TKT-000241
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status="AI_HANDLING" />
              <PriorityBadge priority="HIGH" />
            </div>
          </header>
          <MessageScroller>
            <MessageScrollerContent>
              <Marker>
                <MarkerContent>Today, 10:24 AM</MarkerContent>
              </Marker>
              <ChatMessage kind="customer" name="Olivia Rhye" time="10:24 AM">
                We're seeing 502s on staging right after the latest build. We
                rolled back, but the health checks are still red.
              </ChatMessage>
              <ChatMessage kind="ai" name="SupportOps AI" time="10:25 AM">
                I’m checking the deploy context and the workspace knowledge now.
                I’ll escalate if I can’t verify a safe fix.
                <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-status-ai" />
              </ChatMessage>
              <Marker>
                <MarkerContent>AI Agent is investigating</MarkerContent>
              </Marker>
            </MessageScrollerContent>
          </MessageScroller>
          <form
            className="border-t p-3"
            onSubmit={(event) => event.preventDefault()}
          >
            <InputGroup>
              <InputGroupTextarea placeholder="Reply to Olivia..." />
              <InputGroupAddon align="block-end">
                <InputGroupButton size="icon-sm" aria-label="Attach file">
                  <PaperclipIcon />
                </InputGroupButton>
                <InputGroupButton
                  className="ml-auto"
                  size="icon-sm"
                  variant="default"
                  type="submit"
                  aria-label="Send reply"
                >
                  <SendIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </section>
      </div>
    </PlatformAppShell>
  );
}
function ChatMessage({
  kind,
  name,
  time,
  children,
}: {
  kind: "customer" | "ai" | "human";
  name: string;
  time: string;
  children: ReactNode;
}) {
  const isHuman = kind === "human";
  return (
    <Message align={isHuman ? "end" : "start"}>
      <MessageAvatar>
        {kind === "ai" ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-status-ai/15 text-status-ai">
            <BotIcon className="size-4" />
          </span>
        ) : (
          <Avatar className="size-8">
            <AvatarFallback>
              {name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
        )}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{name}</MessageHeader>
        <Bubble variant={kind}>
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
        <MessageFooter>{time}</MessageFooter>
      </MessageContent>
    </Message>
  );
}
