import { Queue, type ConnectionOptions } from "bullmq";

export type TicketKnowledgeIndexJob = {
  ticketId: string;
  workspaceId: string;
};

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};

let ticketKnowledgeIndexQueue: Queue<TicketKnowledgeIndexJob> | null = null;

export function getTicketKnowledgeIndexQueue() {
  ticketKnowledgeIndexQueue ??= new Queue<TicketKnowledgeIndexJob>("ticket-knowledge-index", {
    connection,
  });
  return ticketKnowledgeIndexQueue;
}

/**
 * Enqueues background indexing for a resolved Ticket. Called right after a
 * resolve transaction commits, from every path that resolves a Ticket.
 */
export async function enqueueTicketKnowledgeIndex(job: TicketKnowledgeIndexJob) {
  await getTicketKnowledgeIndexQueue().add("index", job, {
    attempts: 3,
    backoff: { delay: 2_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
