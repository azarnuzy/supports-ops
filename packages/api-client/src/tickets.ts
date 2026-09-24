import { UnauthorizedApiError } from "./auth";
import type { ApiClient } from "./client";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH";
export type TicketStatus = "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
/** A Workspace-configured category key. The label to show a human lives on `TicketCategoryOption`. */
export type TicketCategory = string;

export type TicketMessage = {
  content: string;
  createdAt: string;
  deliveryFailureReason?: string | null;
  deliveryStatus: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  position: number;
  senderType: "CUSTOMER" | "AI_AGENT" | "HUMAN_AGENT" | "SYSTEM";
};

export type SupportTicket = {
  assignedHumanAgent: { id: string; name: string } | null;
  category: TicketCategory;
  createdAt: string;
  escalatedAt: string | null;
  escalationSummary: string | null;
  escalationSummaryStatus: "PENDING" | "READY" | "FAILED";
  id: string;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  customerIdentity: { name: string };
  messages: TicketMessage[];
  unreadCount: number;
};

export type TicketListItem = {
  assignedHumanAgent: { id: string; name: string } | null;
  category: TicketCategory;
  channel: { name: string; type: "WEB" | "WHATSAPP" };
  createdAt: string;
  customerIdentity: { email: string | null; id: string; name: string; phoneE164: string | null };
  id: string;
  priority: TicketPriority;
  resolvedAt: string | null;
  status: TicketStatus;
  title: string;
  unreadCount: number;
  updatedAt: string;
};

export type TicketAttachment = {
  extractedText: string | null;
  failureReason: string | null;
  fileName: string;
  id: string;
  mimeType: string;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  sizeBytes: number;
};

export type TicketDetailMessage = TicketMessage & {
  attachments: TicketAttachment[];
  id: string;
  senderUserId: string | null;
};

export type TicketActivity = {
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, unknown>;
};

export type TicketDetail = TicketListItem & {
  aiActivities: TicketActivity[];
  escalationReason: string | null;
  escalationSummary: string | null;
  escalationSummaryStatus: "PENDING" | "READY" | "FAILED";
  messages: TicketDetailMessage[];
  session: { createdAt: string; customerLastMessageAt: string | null };
  resolutionReason: string | null;
  resolvedBy: string | null;
};

export class TicketAlreadyClaimedApiError extends Error {}

export class TicketNotFoundApiError extends Error {
  constructor() {
    super("This Ticket no longer exists.");
    this.name = "TicketNotFoundApiError";
  }
}

export async function getTicketDetail(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].$get({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 404) throw new TicketNotFoundApiError();
  if (!response.ok) throw new Error("Failed to load the Ticket.");
  return (await response.json()) as { ticket: TicketDetail };
}

export async function markTicketRead(client: ApiClient, id: string, position: number) {
  const response = await client.tickets[":id"].read.$post({ param: { id }, json: { position } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 404) throw new TicketNotFoundApiError();
  if (!response.ok) throw new Error("Failed to update read state.");
  return (await response.json()) as { lastReadPosition: number };
}

/** Streams realtime updates for one Ticket (new Messages, delivery and
 * status changes). The event name matches the payload's `type`, so
 * `addEventListener` handlers stay untyped and generic.
 *
 * `message.delta` is deliberately absent: `onEvent` discards the payload and
 * only triggers a refetch, so subscribing to a per-token event turned one AI
 * answer into hundreds of refetches. The finished reply still arrives as
 * `message.created`. Token-by-token rendering belongs to the Web Widget,
 * which consumes the delta payload directly. */
export function subscribeToTicketEvents(baseUrl: string, ticketId: string, onEvent: () => void) {
  const events = new EventSource(`${baseUrl}/tickets/${ticketId}/events`, {
    withCredentials: true,
  });
  for (const type of ["message.created", "message.updated", "ticket.status", "attachment.updated"])
    events.addEventListener(type, onEvent);
  return events;
}

/** Attachments open through the signed download URL, never through the raw
 * storage key. */
export async function getAttachmentUrl(
  client: ApiClient,
  id: string,
  mode: "download" | "preview",
) {
  const response = await client.attachments[":id"][":mode"].$get({ param: { id, mode } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to open the attachment.");
  return (await response.json()) as { url: string };
}

export const getAttachmentDownloadUrl = (client: ApiClient, id: string) =>
  getAttachmentUrl(client, id, "download");

export async function listSharedHumanQueue(client: ApiClient) {
  const response = await client.tickets.queue.$get();
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load the Shared Human Queue.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function listMyTickets(client: ApiClient) {
  const response = await client.tickets.mine.$get();
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load your Tickets.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function listLiveAiTickets(client: ApiClient) {
  const response = await client.tickets.live.$get();

  if (response.status === 403) throw new Error("Only an Admin can view live AI-handled Tickets.");
  if (!response.ok) throw new Error("Failed to load live Tickets.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function takeOverTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].takeover.$post({ param: { id } });

  if (response.status === 403) throw new Error("Only an Admin can take over Tickets.");
  if (response.status === 409) throw new Error("This Ticket is no longer handled by the AI Agent.");
  if (!response.ok) throw new Error("Failed to take over the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function claimTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].claim.$post({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only Human Agents can claim Tickets.");
  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new TicketAlreadyClaimedApiError(data.message);
  }
  if (!response.ok) throw new Error("Failed to claim the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function reassignTicket(client: ApiClient, id: string, humanAgentId: string) {
  const response = await client.tickets[":id"].assignee.$patch({
    param: { id },
    json: { humanAgentId },
  });

  if (response.status === 403) throw new Error("Only an Admin can reassign Tickets.");
  if (response.status === 422) throw new Error("Choose an active Human Agent in this Workspace.");
  if (response.status === 409) throw new Error("This Ticket can no longer be assigned.");
  if (!response.ok) throw new Error("Failed to reassign the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function sendHumanReply(
  client: ApiClient,
  id: string,
  content: string,
  idempotencyKey: string,
) {
  const response = await client.tickets[":id"].messages.$post({
    param: { id },
    json: { content, idempotencyKey },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (!response.ok) throw new Error("Failed to send the reply.");
  return response.json();
}

export async function sendHumanAttachments(
  client: ApiClient,
  id: string,
  content: string,
  files: File[],
  idempotencyKey: string,
) {
  const response = await client.tickets[":id"].attachments.$post({
    form: { content, files, idempotencyKey },
    param: { id },
  } as never);
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (response.status === 422)
    throw new Error("Attachments must be PDF, TXT, JPG, or PNG and no larger than 10 MB.");
  if (!response.ok) throw new Error("Failed to send the reply.");
  return response.json();
}

export async function retryHumanReply(client: ApiClient, id: string, messageId: string) {
  const response = await client.tickets[":id"].messages[":messageId"].retry.$post({
    param: { id, messageId },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can retry a reply.");
  if (response.status === 409) throw new Error("This reply can no longer be retried.");
  if (!response.ok) throw new Error("Failed to retry the reply.");
  return response.json();
}

export async function generateSuggestedReply(client: ApiClient, id: string) {
  const response = await client.tickets[":id"]["suggested-reply"].$post({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403)
    throw new Error("Only the assigned Human Agent can request a Suggested Reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (response.status === 503)
    throw new Error("Configure OPENROUTER_API_KEY to use the AI Copilot.");
  if (response.status === 402)
    throw new Error("The AI Copilot is unavailable because this Workspace's Credits ran out.");
  if (response.status === 502)
    throw new Error("The AI Copilot could not generate a Suggested Reply. Please try again.");
  if (!response.ok) throw new Error("Failed to generate the Suggested Reply.");
  return (await response.json()) as { suggestedReply: { content: string } };
}

export async function resolveHumanTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].resolve.$post({
    param: { id },
    json: { resolutionReason: "HUMAN_RESOLVED" },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the Ticket owner can resolve this Ticket.");
  if (response.status === 409)
    throw new Error("Finish or retry the pending reply before resolving this Ticket.");
  if (!response.ok) throw new Error("Failed to resolve the Ticket.");
  return response.json();
}
