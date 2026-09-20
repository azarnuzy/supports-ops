import type { SSEStreamingApi } from "hono/streaming";

/** Keeps an SSE stream from being dropped silently.
 *
 * Without a periodic write, a reverse proxy's idle-connection timeout closes
 * the stream and the server never learns: nothing is ever written to it, so the
 * socket error that would fire `onAbort` never happens. The subscription and
 * its Redis connection leak, while the browser quietly reconnects and opens
 * another — the Ticket and Knowledge streams accumulated several per page that
 * way. The ping also makes a drop visible to the client, which replays what it
 * missed on reconnect. */
export function keepStreamAlive(stream: SSEStreamingApi, intervalMs = 20_000) {
  const timer = setInterval(() => {
    void stream.writeSSE({ data: "", event: "ping" });
  }, intervalMs);
  stream.onAbort(() => clearInterval(timer));
}
