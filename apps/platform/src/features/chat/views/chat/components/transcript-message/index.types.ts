import type { TicketAttachment, TicketDetailMessage } from "@repo/api-client";

export type TranscriptMessageProps = {
  message: TicketDetailMessage;
  onRetry: () => void;
  onOpenImage: (attachment: TicketAttachment) => void;
};

export type MessageAttachmentsProps = {
  attachments: TicketAttachment[];
  onOpenImage: (attachment: TicketAttachment) => void;
  showReadability?: boolean;
};
