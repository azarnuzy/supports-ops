import Redis from "ioredis";

export type WidgetEvent = {
  type: "message.created" | "message.delta" | "message.updated" | "ticket.status";
  data: unknown;
};

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
