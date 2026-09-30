import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { evalConfig } from "../../config";
import { isUnsafeAddress } from "../tools/execution";

export class UnsafeDestinationError extends Error {}

type Resolver = typeof lookup;

/** Rejects any endpoint a Workspace Admin should not be able to make the server call: non-HTTPS,
 * embedded credentials, or a host resolving to a private/loopback/link-local address. Hosts on the
 * deployment-owned allowlist may be private or plain HTTP. Callers pass the host through as
 * resolved at check time; a hostile DNS record changing between check and connect is the same
 * residual risk the HTTP Tool guard accepts. */
export async function assertSafeDestination(
  rawUrl: string,
  resolve: Resolver = lookup,
  allowedHosts: readonly string[] = evalConfig.destinationAllowedHosts,
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeDestinationError("Enter a valid URL.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowed = allowedHosts.includes(hostname);
  if (url.protocol !== "https:" && !(allowed && url.protocol === "http:")) {
    throw new UnsafeDestinationError("The endpoint must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new UnsafeDestinationError("The endpoint must not contain credentials.");
  }
  if (allowed) return url;
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolve(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new UnsafeDestinationError("This endpoint is not reachable from a public address.");
  }
  return url;
}
