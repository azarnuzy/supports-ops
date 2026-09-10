import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import { formatEnumLabel, getInitials } from "../../../../../../lib/utils";
import { formatShortDate } from "../../chat.utils";
import type { AllTicketRowProps } from "./index.types";

export default function AllTicketRow({ active, onSelect, ticket }: AllTicketRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border border-transparent p-2.5 text-left transition-colors",
        active ? "border-border bg-accent" : "hover:bg-accent/60",
      )}
    >
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="text-[11px] ring-1 ring-border">
          {getInitials(ticket.customerIdentity.name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium leading-5">
            {ticket.customerIdentity.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] leading-5 text-muted-foreground tabular-nums">
              {formatShortDate(ticket.updatedAt)}
            </span>
            {ticket.unreadCount > 0 ? (
              <Badge
                aria-label={`${ticket.unreadCount} unread`}
                className="min-w-4 justify-center px-1.5"
                variant="default"
              >
                {ticket.unreadCount}
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
          {ticket.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1 gap-y-1">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <Badge className="px-1.5" variant="outline">
            {formatEnumLabel(ticket.category)}
          </Badge>
          {ticket.assignedHumanAgent ? (
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {ticket.assignedHumanAgent.name}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
