import {
  claimTicket as claimTicketRequest,
  createApiClient,
  generateSuggestedReply as generateSuggestedReplyRequest,
  getAttachmentDownloadUrl,
  getAttachmentUrl,
  getTicketDetail as getTicketDetailRequest,
  listLiveAiTickets as listLiveAiTicketsRequest,
  listMyTickets as listMyTicketsRequest,
  listSharedHumanQueue as listSharedHumanQueueRequest,
  listTickets as listTicketsRequest,
  reassignTicket as reassignTicketRequest,
  resolveHumanTicket as resolveHumanTicketRequest,
  retryHumanReply as retryHumanReplyRequest,
  sendHumanReply as sendHumanReplyRequest,
  sendHumanAttachments as sendHumanAttachmentsRequest,
  takeOverTicket as takeOverTicketRequest,
  type ListTicketsFilters,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getSharedHumanQueue() {
  return listSharedHumanQueueRequest(apiClient);
}

export function getTickets(filters: ListTicketsFilters) {
  return listTicketsRequest(apiClient, filters);
}

export function getTicketDetail(id: string) {
  return getTicketDetailRequest(apiClient, id);
}

/** Opens the attachment in a new tab via its signed download URL. */
export async function openAttachment(id: string) {
  const { url } = await getAttachmentDownloadUrl(apiClient, id);
  window.open(url, "_blank", "noopener");
}

export async function getAttachmentPreviewUrl(id: string) {
  return getAttachmentUrl(apiClient, id, "preview");
}

export function getMyTickets() {
  return listMyTicketsRequest(apiClient);
}

export function getLiveAiTickets() {
  return listLiveAiTicketsRequest(apiClient);
}

export function takeOverTicket(id: string) {
  return takeOverTicketRequest(apiClient, id);
}

export function claimTicket(id: string) {
  return claimTicketRequest(apiClient, id);
}

export function reassignTicket(input: { id: string; humanAgentId: string }) {
  return reassignTicketRequest(apiClient, input.id, input.humanAgentId);
}

export function sendHumanReply(input: { id: string; content: string; idempotencyKey: string }) {
  return sendHumanReplyRequest(apiClient, input.id, input.content, input.idempotencyKey);
}

export function sendHumanAttachments(input: { id: string; content: string; files: File[]; idempotencyKey: string }) {
  return sendHumanAttachmentsRequest(apiClient, input.id, input.content, input.files, input.idempotencyKey);
}

export function retryHumanReply(input: { id: string; messageId: string }) {
  return retryHumanReplyRequest(apiClient, input.id, input.messageId);
}

export function generateSuggestedReply(id: string) {
  return generateSuggestedReplyRequest(apiClient, id);
}

export function resolveHumanTicket(id: string) {
  return resolveHumanTicketRequest(apiClient, id);
}

export function subscribeToSharedHumanQueue(onChange: () => void) {
  const events = new EventSource(`${apiBaseUrl}/tickets/queue/events`, { withCredentials: true });
  events.addEventListener("ticket.queue.changed", onChange);
  return () => events.close();
}
