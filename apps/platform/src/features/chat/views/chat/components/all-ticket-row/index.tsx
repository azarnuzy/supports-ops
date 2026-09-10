import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { getInitials } from "../../../../../../lib/utils";
import type { AllTicketRowProps } from "./index.types";

export default function AllTicketRow({ active, onSelect, ticket }: AllTicketRowProps) {
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
