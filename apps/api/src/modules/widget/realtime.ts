import Redis from "ioredis";

export type WidgetEvent = {
  type: "message.created" | "message.delta" | "message.updated" | "ticket.status";
  data: unknown;
};

const generatingTickets = new Set<string>();

export function setTicketGenerating(ticketId: string, generating: boolean) {
  if (generating) generatingTickets.add(ticketId);
  else generatingTickets.delete(ticketId);
}

export function isTicketGenerating(ticketId: string) {
  return generatingTickets.has(ticketId);
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";
let publisher: Redis | undefined;

function channel(ticketId: string) {
  return `supportops:ticket:${ticketId}`;
}

export async function publishWidgetEvent(ticketId: string, event: WidgetEvent) {
  publisher ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  await publisher.publish(channel(ticketId), JSON.stringify(event));
}

export async function subscribeToWidgetEvents(ticketId: string, onEvent: (event: WidgetEvent) => void) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on("message", (_channel, payload) => onEvent(JSON.parse(payload) as WidgetEvent));
  await subscriber.subscribe(channel(ticketId));
  return () => subscriber.disconnect();
}
