import type { ActivityDescription } from "../../../tickets/activity-description";

export type TicketScope = "mine" | "unassigned" | "ai-live" | "all";

export type DetailsTab = "details" | "attachments" | "activity";

export type TimelineEntry = {
  createdAt: string;
  description: ActivityDescription;
  id: string;
};
