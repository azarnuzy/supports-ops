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

/** Every image the browser can render, not just the two types a Customer may
 * upload: WhatsApp also delivers stickers as `image/webp`. */
export function isImage(attachment: TicketAttachment) {
  return attachment.mimeType.startsWith("image/");
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

export function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Timeline day-separator label; adds the year only when it is not the current one. */
export function formatActivityDay(date: string) {
  const day = new Date(date);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (day.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return day.toLocaleDateString(undefined, options);
}

/** Compact per-entry time for the Activity Timeline's time column. */
export function formatActivityTime(date: string) {
  return new Date(date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatTimestamp(date: string) {
  return new Date(date).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

export function scopeUnreadTotal(data: { tickets: SupportTicket[] } | undefined) {
  return data?.tickets.reduce((total, ticket) => total + ticket.unreadCount, 0) ?? 0;
}
