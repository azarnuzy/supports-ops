import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const timeoutMs = 15_000;

export type McpCredentials = {
  bearerToken?: string;
  secretHeaders?: Record<string, string>;
};

export async function withMcpClient<T>(
  endpoint: string,
  credentials: McpCredentials,
  operation: (client: Client) => Promise<T>,
  options: { allowPrivateNetwork?: boolean; fetch?: typeof fetch } = {},
) {
  const url = new URL(endpoint);
  await assertSafeUrl(url, options.allowPrivateNetwork);
  const headers = new Headers(credentials.secretHeaders);
  if (credentials.bearerToken) headers.set("authorization", `Bearer ${credentials.bearerToken}`);

  const guardedFetch: typeof fetch = async (input, init) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input.toString());
    await assertSafeUrl(requestUrl, options.allowPrivateNetwork);
    return (options.fetch ?? fetch)(input, {
      ...init,
      redirect: "error",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  };

  const client = new Client({ name: "SupportOps", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: guardedFetch,
    requestInit: { headers },
  });
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return await operation(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function assertSafeUrl(url: URL, allowPrivateNetwork = false) {
  if (url.protocol !== "https:" && !allowPrivateNetwork) throw new Error("MCP endpoint must use HTTPS.");
  if (url.username || url.password) throw new Error("MCP endpoint credentials must use secret fields.");
  if (allowPrivateNetwork) return;

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("MCP endpoint must not resolve to a private network.");
  }
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  return (
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("169.254.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}
