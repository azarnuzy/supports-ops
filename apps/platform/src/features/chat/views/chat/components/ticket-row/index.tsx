import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { PriorityBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { getInitials } from "../../../../../../lib/utils";
import { formatWaitingDuration } from "../../chat.utils";
import type { TicketRowProps } from "./index.types";

export default function TicketRow({ active, onSelect, ticket }: TicketRowProps) {
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
