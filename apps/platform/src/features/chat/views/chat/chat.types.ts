export type TicketScope = "mine" | "unassigned" | "ai-live" | "all";

export type DetailsTab = "details" | "attachments" | "activity";

export type TimelineEntry = {
  createdAt: string;
  description: { mono?: string; text: string };
  id: string;
};
