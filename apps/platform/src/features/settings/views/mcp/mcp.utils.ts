export type McpConnectionState = "connected" | "degraded" | "disconnected";

/**
 * Derived purely from what's already in memory this session (enabled flag + last
 * test result) — no persisted connection history or new metrics backend.
 */
export function getConnectionState(
  enabled: boolean,
  lastTest: { ok: boolean } | undefined,
): McpConnectionState {
  if (!enabled) return "disconnected";
  if (lastTest && !lastTest.ok) return "degraded";
  return "connected";
}
