import type { ConversationListItem } from "@repo/api-client";

export type AllTicketRowProps = {
  active: boolean;
  conversation: ConversationListItem;
  onSelect: () => void;
};
