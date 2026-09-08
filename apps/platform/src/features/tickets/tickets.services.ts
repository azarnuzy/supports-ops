import {
  claimTicket as claimTicketRequest,
  createApiClient,
  listMyTickets as listMyTicketsRequest,
  listSharedHumanQueue as listSharedHumanQueueRequest,
  reassignTicket as reassignTicketRequest,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getSharedHumanQueue() {
  return listSharedHumanQueueRequest(apiClient);
}

export function getMyTickets() {
  return listMyTicketsRequest(apiClient);
}

export function claimTicket(id: string) {
  return claimTicketRequest(apiClient, id);
}

export function reassignTicket(input: { id: string; humanAgentId: string }) {
  return reassignTicketRequest(apiClient, input.id, input.humanAgentId);
}

export function subscribeToSharedHumanQueue(onChange: () => void) {
  const events = new EventSource(`${apiBaseUrl}/tickets/queue/events`, { withCredentials: true });
  events.addEventListener("ticket.queue.changed", onChange);
  return () => events.close();
}
