import type { SupportTicket, TicketAttachment, TicketDetailMessage } from "@repo/api-client";

export function senderName(message: TicketDetailMessage) {
  if (message.senderType === "CUSTOMER") return "Customer";
  if (message.senderType === "AI_AGENT") return "AI Agent";
  if (message.senderType === "HUMAN_AGENT") return "Human Agent";
  return "System";
}

export function bubbleVariant(senderType: TicketDetailMessage["senderType"]) {
  if (senderType === "AI_AGENT") return "ai" as const;
  if (senderType === "HUMAN_AGENT") return "human" as const;
  return "customer" as const;
}

export function isImage(attachment: TicketAttachment) {
  return attachment.mimeType === "image/jpeg" || attachment.mimeType === "image/png";
}

export function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = sizeBytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatWaitingDuration(since: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function scopeUnreadTotal(data: { tickets: SupportTicket[] } | undefined) {
  return data?.tickets.reduce((total, ticket) => total + ticket.unreadCount, 0) ?? 0;
}
