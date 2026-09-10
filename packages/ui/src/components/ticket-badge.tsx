import { BotIcon, CircleIcon, UserRoundIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

type TicketStatus = "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
type TicketPriority = "LOW" | "NORMAL" | "HIGH";

const statusStyles: Record<TicketStatus, string> = {
  AI_HANDLING: "border-status-ai/30 bg-status-ai/10 text-[var(--status-ai-foreground)]",
  ESCALATED:
    "border-status-escalated/30 bg-status-escalated/10 text-[var(--status-escalated-foreground)]",
  HUMAN_HANDLING: "border-status-human/30 bg-status-human/10 text-[var(--status-human-foreground)]",
  RESOLVED:
    "border-status-resolved/30 bg-status-resolved/10 text-[var(--status-resolved-foreground)]",
};

const priorityStyles: Record<TicketPriority, string> = {
  LOW: "border-border text-muted-foreground [&>svg]:fill-muted-foreground [&>svg]:text-muted-foreground",
  NORMAL: "border-border text-foreground [&>svg]:fill-foreground [&>svg]:text-foreground",
  HIGH: "border-[var(--priority-high)]/40 text-[var(--priority-high)] [&>svg]:fill-[var(--priority-high)] [&>svg]:text-[var(--priority-high)]",
};

const statusLabels: Record<TicketStatus, string> = {
  AI_HANDLING: "AI handling",
  ESCALATED: "Escalated",
  HUMAN_HANDLING: "Human handling",
  RESOLVED: "Resolved",
};

function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const Icon =
    status === "AI_HANDLING" ? BotIcon : status === "HUMAN_HANDLING" ? UserRoundIcon : CircleIcon;
  return (
    <Badge variant="outline" className={cn("px-1.5", statusStyles[status], className)}>
      <Icon />
      {statusLabels[status]}
    </Badge>
  );
}

const priorityLabels: Record<TicketPriority, string> = {
  HIGH: "High",
  LOW: "Low",
  NORMAL: "Normal",
};

function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  return (
    <Badge variant="outline" className={cn("px-1.5", priorityStyles[priority], className)}>
      <CircleIcon className="size-2" />
      {priorityLabels[priority]}
    </Badge>
  );
}
export { PriorityBadge, StatusBadge, type TicketPriority, type TicketStatus };
