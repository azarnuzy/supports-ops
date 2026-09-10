import type { SupportTicket } from "@repo/api-client";

export type TicketRowProps = {
  active: boolean;
  onSelect: () => void;
  ticket: SupportTicket;
};
