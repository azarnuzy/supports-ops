import type { SessionWithoutTicket } from "@repo/api-client";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Empty, EmptyDescription, EmptyTitle } from "@repo/ui/components/empty";
import { InputGroup, InputGroupInput } from "@repo/ui/components/input-group";
import { MessageScroller, MessageScrollerContent } from "@repo/ui/components/message-scroller";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
import {
  sessionWithoutTicketQueryOptions,
  useSessionsWithoutTicketQuery,
} from "../../../tickets/tickets.hooks";
import { formatShortDate } from "../chat/chat.utils";
import { TranscriptMessage } from "../chat/components";

/**
 * Conversations the AI Agent answered without ever opening a Ticket: the
 * classification decided they were not support requests. Laid out like the
 * Ticket Inbox so the same conversation reads the same way in both, minus
 * everything a Ticket carries and these do not have — status, priority,
 * category, assignee, and a reply box.
 */
export default function NoTicketView() {
  const navigate = useNavigate();
  const routeSearch = useSearch({ strict: false }) as { q?: string; session?: string };
  const sessionId = routeSearch.session;
  const search = routeSearch.q ?? "";
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const sessions = useSessionsWithoutTicketQuery();
  const detail = useQuery({
    ...sessionWithoutTicketQueryOptions(sessionId ?? ""),
    enabled: Boolean(sessionId),
  });
  const conversation = detail.data?.session;

  const rows = (sessions.data?.pages.flatMap((page) => page.sessions) ?? []).filter((session) =>
    search ? matchesSearch(session, search) : true,
  );

  const setSearchParam = (key: "q" | "session", value: string | undefined) =>
    void navigate({
      replace: key === "q",
      search: (prev: Record<string, string | undefined>) => ({
        ...prev,
        [key]: value || undefined,
      }),
      to: "/chat/no-ticket",
    });

  useEffect(() => {
    if (!conversation) return;
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  return (
    <PlatformAppShell fullBleed>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-r",
            sessionId && "hidden md:flex",
          )}
        >
          <p className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            Conversations the AI Agent answered without opening a Ticket
          </p>
          <div className="border-b p-2.5">
            <InputGroup>
              <InputGroupInput
                aria-label="Search conversations by customer name"
                onChange={(event) => setSearchParam("q", event.target.value)}
                placeholder="Search conversations..."
                value={search}
              />
            </InputGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessions.isPending ? (
              <div className="grid gap-1.5 p-1">
                <Skeleton className="h-[4.25rem] w-full" />
                <Skeleton className="h-[4.25rem] w-full" />
                <Skeleton className="h-[4.25rem] w-full" />
              </div>
            ) : null}
            {sessions.isError ? (
              <p className="p-4 text-center text-xs text-destructive">
                Unable to load conversations.
              </p>
            ) : null}
            {sessions.data && rows.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {search
                  ? "No conversations match this search."
                  : "Every conversation a Customer started has opened a Ticket."}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {rows.map((row) => (
                <SessionRow
                  active={row.id === sessionId}
                  key={row.id}
                  onSelect={() => setSearchParam("session", row.id)}
                  session={row}
                />
              ))}
            </div>
            {sessions.hasNextPage ? (
              <Button
                className="mt-2 w-full"
                disabled={sessions.isFetchingNextPage}
                onClick={() => void sessions.fetchNextPage()}
                size="sm"
                variant="outline"
              >
                {sessions.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        </aside>

        <section
          className={cn("flex min-h-0 flex-col overflow-hidden", !sessionId && "hidden md:flex")}
        >
          {!sessionId ? (
            <Empty className="m-auto border-0">
              <EmptyTitle>Select a conversation</EmptyTitle>
              <EmptyDescription>
                These are the messages the AI Agent decided were not support requests.
              </EmptyDescription>
            </Empty>
          ) : null}
          {sessionId && detail.isPending ? (
            <div className="grid gap-3 p-6">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          ) : null}
          {sessionId && detail.isError ? (
            <Empty className="m-auto border-0">
              <EmptyTitle>Unable to load this conversation</EmptyTitle>
              <EmptyDescription>
                It may have become a Ticket, or you may not have access to it.
              </EmptyDescription>
            </Empty>
          ) : null}
          {conversation ? (
            <>
              <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Link
                    aria-label="Back to the conversation list"
                    className="shrink-0 md:hidden"
                    search={(prev: Record<string, string | undefined>) => ({
                      ...prev,
                      session: undefined,
                    })}
                    to="/chat/no-ticket"
                  >
                    <ArrowLeftIcon className="size-4" />
                  </Link>
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs">
                      {getInitials(conversation.customerIdentity.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm leading-5 font-semibold">
                      {conversation.customerIdentity.name}
                    </p>
                    <p className="truncate text-xs leading-4 text-muted-foreground">
                      {conversation.channel.name}
                    </p>
                  </div>
                </div>
              </header>
              <MessageScroller>
                <MessageScrollerContent className="gap-4 bg-muted/40 px-4 py-4">
                  {conversation.messages.map((message) => (
                    <div key={message.id}>
                      <TranscriptMessage
                        message={message}
                        onOpenImage={() => undefined}
                        onRetry={() => undefined}
                      />
                    </div>
                  ))}
                  <div ref={transcriptEnd} />
                </MessageScrollerContent>
              </MessageScroller>
              <p className="shrink-0 border-t bg-background p-2.5 text-center text-xs text-muted-foreground">
                No Ticket was opened for this conversation, so there is nothing to reply to or
                escalate here.
              </p>
            </>
          ) : null}
        </section>
      </div>
    </PlatformAppShell>
  );
}

/** The Ticket Inbox row without the parts a Ticket-less conversation has no
 * value for: status, priority, category, assignee, and unread count. */
function SessionRow({
  active,
  onSelect,
  session,
}: {
  active: boolean;
  onSelect: () => void;
  session: SessionWithoutTicket;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border border-transparent p-2.5 text-left transition-colors",
        active ? "border-border bg-accent" : "hover:bg-accent/60",
      )}
      onClick={onSelect}
      type="button"
    >
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="text-[11px] ring-1 ring-border">
          {getInitials(session.customerIdentity.name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium leading-5">
            {session.customerIdentity.name}
          </span>
          <span className="shrink-0 text-[11px] leading-5 text-muted-foreground tabular-nums">
            {formatShortDate(session.customerLastMessageAt ?? session.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
          {session.lastMessage?.content ?? "No messages"}
        </span>
        <span className="mt-1.5 block truncate text-[11px] leading-4 text-muted-foreground">
          {session.channel.name}
        </span>
      </span>
    </button>
  );
}

/** The list endpoint has no search parameter, so the filter applies to the
 * pages already loaded — the same names the Inbox search matches on. */
function matchesSearch(session: SessionWithoutTicket, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  const haystack = [
    session.customerIdentity.name,
    session.customerIdentity.email,
    session.customerIdentity.phoneE164,
  ];
  return haystack.some((value) => value?.toLocaleLowerCase().includes(needle));
}
