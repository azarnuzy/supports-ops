import type { TicketAttachment } from "@repo/api-client";

export type AttachmentCardProps = {
  attachment: TicketAttachment;
  onOpenImage: () => void;
  showReadability?: boolean;
};
