import { UnauthorizedApiError } from "./auth";
import type { ApiClient } from "./client";
import type { TicketCategory, TicketDetailMessage, TicketPriority, TicketStatus } from "./tickets";

export type ListConversationsFilters = {
  assigneeId?: string;
  category?: TicketCategory[];
  cursor?: string;
  limit?: number;
  priority?: TicketPriority[];
  search?: string;
  status?: TicketStatus[];
};

/** All Conversations: a Session, with its Ticket projected only when one
 * exists. A `ticket: null` row is a conversation the AI Agent answered
 * without ever opening a Ticket — it carries no status, priority, category,
 * assignee, or unread count, because it never had any. */
export type ConversationTicket = {
  assignedHumanAgent: { id: string; name: string } | null;
  category: TicketCategory;
  id: string;
  priority: TicketPriority;
  resolvedAt: string | null;
  status: TicketStatus;
  title: string;
  unreadCount: number;
  updatedAt: string;
};

export type ConversationListItem = {
  channel: { name: string; type: "WEB" | "WHATSAPP" };
  createdAt: string;
  customerIdentity: { email: string | null; id: string; name: string; phoneE164: string | null };
  customerLastMessageAt: string | null;
  id: string;
  lastMessage: { content: string; createdAt: string; senderType: string } | null;
  ticket: ConversationTicket | null;
};

export async function listConversations(client: ApiClient, filters: ListConversationsFilters = {}) {
  const response = await client.tickets.$get({
    query: {
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.category?.length ? { category: filters.category.join(",") } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
      ...(filters.limit ? { limit: String(filters.limit) } : {}),
      ...(filters.priority?.length ? { priority: filters.priority.join(",") } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status?.length ? { status: filters.status.join(",") } : {}),
    },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load Conversations.");
  return (await response.json()) as {
    conversations: ConversationListItem[];
    nextCursor: string | null;
  };
}

export type ConversationSessionDetail = {
  channel: { name: string; type: "WEB" | "WHATSAPP" };
  createdAt: string;
  customerIdentity: { email: string | null; id: string; name: string; phoneE164: string | null };
  customerLastMessageAt: string | null;
  id: string;
  messages: TicketDetailMessage[];
  status: string;
};

export class SessionNotFoundApiError extends Error {
  constructor() {
    super("This conversation no longer exists.");
    this.name = "SessionNotFoundApiError";
  }
}

/** The read-only transcript of a Conversation row whose Session never opened
 * a Ticket. Tickets are opened through `getTicketDetail` instead. */
export async function getConversationSession(client: ApiClient, sessionId: string) {
  const response = await client.tickets.conversations[":sessionId"].$get({
    param: { sessionId },
  });
  if (response.status === 403) throw new Error("Only an Admin can view this conversation.");
  if (response.status === 404) throw new SessionNotFoundApiError();
  if (!response.ok) throw new Error("Failed to load the conversation.");
  return (await response.json()) as { session: ConversationSessionDetail };
}
