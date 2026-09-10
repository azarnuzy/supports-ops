import type { TicketListItem } from "@repo/api-client";

export type AllTicketRowProps = {
  active: boolean;
  onSelect: () => void;
  ticket: TicketListItem;
};
