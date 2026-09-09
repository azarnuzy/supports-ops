import Redis from "ioredis";

export type WidgetEvent = {
  type:
    | "attachment.updated"
    | "message.created"
    | "message.delta"
    | "message.updated"
    | "ticket.status";
  data: unknown;
};

export type TicketQueueEvent = { type: "ticket.queue.changed" };

export type KnowledgeIngestStage =
  | "UPLOADING"
  | "EXTRACTING"
  | "CHUNKING"
  | "EMBEDDING"
  | "INDEXING"
  | "PUBLISHED";

export type KnowledgeSourceEvent = {
  type: "knowledge.updated";
  data: {
    knowledgeSourceId: string;
    status: "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED";
    stage?: KnowledgeIngestStage | null;
    failedStage?: KnowledgeIngestStage | null;
    failureReason?: string | null;
  };
};

const generatingTickets = new Set<string>();

export function setTicketGenerating(ticketId: string, generating: boolean) {
  if (generating) generatingTickets.add(ticketId);
  else generatingTickets.delete(ticketId);
}

export function isTicketGenerating(ticketId: string) {
  return generatingTickets.has(ticketId);
}

/** A streamed model response cannot safely become a durable Message once a
 * human has taken ownership. Removing it from this set makes both deltas and
 * the eventual completed response a no-op. */
export function cancelTicketGeneration(ticketId: string) {
  generatingTickets.delete(ticketId);
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";
let publisher: Redis | undefined;

function channel(ticketId: string) {
  return `supportops:ticket:${ticketId}`;
}

function queueChannel(workspaceId: string) {
  return `supportops:ticket-queue:${workspaceId}`;
}

function knowledgeChannel(workspaceId: string) {
  return `supportops:knowledge:${workspaceId}`;
}

export async function publishWidgetEvent(ticketId: string, event: WidgetEvent) {
  publisher ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  await publisher.publish(channel(ticketId), JSON.stringify(event));
}

export async function subscribeToWidgetEvents(
  ticketId: string,
  onEvent: (event: WidgetEvent) => void,
) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on("message", (_channel, payload) => onEvent(JSON.parse(payload) as WidgetEvent));
  await subscriber.subscribe(channel(ticketId));
  return () => subscriber.disconnect();
}

export async function publishTicketQueueEvent(workspaceId: string) {
  publisher ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  await publisher.publish(
    queueChannel(workspaceId),
    JSON.stringify({ type: "ticket.queue.changed" } satisfies TicketQueueEvent),
  );
}

export async function subscribeToTicketQueueEvents(
  workspaceId: string,
  onEvent: (event: TicketQueueEvent) => void,
) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on("message", (_channel, payload) => onEvent(JSON.parse(payload) as TicketQueueEvent));
  await subscriber.subscribe(queueChannel(workspaceId));
  return () => subscriber.disconnect();
}

export async function publishKnowledgeSourceEvent(
  workspaceId: string,
  data: KnowledgeSourceEvent["data"],
) {
  publisher ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  await publisher.publish(
    knowledgeChannel(workspaceId),
    JSON.stringify({ data, type: "knowledge.updated" } satisfies KnowledgeSourceEvent),
  );
}

export async function subscribeToKnowledgeSourceEvents(
  workspaceId: string,
  onEvent: (event: KnowledgeSourceEvent) => void,
) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on("message", (_channel, payload) =>
    onEvent(JSON.parse(payload) as KnowledgeSourceEvent),
  );
  await subscriber.subscribe(knowledgeChannel(workspaceId));
  return () => subscriber.disconnect();
}
