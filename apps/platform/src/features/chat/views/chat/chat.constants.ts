import type { TicketCategory, TicketPriority, TicketStatus } from "@repo/api-client";

export const scopeRoutes = {
  "ai-live": { list: "/chat/ai-live" as const, ticket: "/chat/ai-live/tickets/$ticketId" as const },
  all: { list: "/chat/all" as const, ticket: "/chat/all/tickets/$ticketId" as const },
  mine: { list: "/chat" as const, ticket: "/chat/tickets/$ticketId" as const },
  unassigned: {
    list: "/chat/unassigned" as const,
    ticket: "/chat/unassigned/tickets/$ticketId" as const,
  },
};

export const statusFilterOptions: { label: string; value: TicketStatus | "ALL" }[] = [
  { label: "All statuses", value: "ALL" },
  { label: "AI handling", value: "AI_HANDLING" },
  { label: "Escalated", value: "ESCALATED" },
  { label: "Human handling", value: "HUMAN_HANDLING" },
  { label: "Resolved", value: "RESOLVED" },
];

export const priorityFilterOptions: { label: string; value: TicketPriority | "ALL" }[] = [
  { label: "All priorities", value: "ALL" },
  { label: "High", value: "HIGH" },
  { label: "Normal", value: "NORMAL" },
  { label: "Low", value: "LOW" },
];

export const categoryFilterOptions: { label: string; value: TicketCategory | "ALL" }[] = [
  { label: "All categories", value: "ALL" },
  { label: "Account", value: "ACCOUNT" },
  { label: "Billing", value: "BILLING" },
  { label: "Subscription", value: "SUBSCRIPTION" },
  { label: "Technical", value: "TECHNICAL" },
  { label: "General", value: "GENERAL" },
];
