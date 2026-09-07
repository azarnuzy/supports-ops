import Redis from "ioredis";

const windowSeconds = 60;
const sessionLimit = 30;
const addressLimit = 60;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";
let redis: Redis | undefined;

const incrementWithinWindow = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return {count, redis.call('TTL', KEYS[1])}
`;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function limitWidgetMessage(sessionToken: string, address: string): Promise<RateLimitResult> {
  const session = await consume(`supportops:widget-rate:session:${sessionToken}`, sessionLimit);
  if (!session.allowed) return session;

  return consume(`supportops:widget-rate:address:${address}`, addressLimit);
}

async function consume(key: string, limit: number): Promise<RateLimitResult> {
  redis ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  const [count, ttl] = (await redis.eval(incrementWithinWindow, 1, key, String(windowSeconds))) as [number, number];
  if (count <= limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
}

export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
