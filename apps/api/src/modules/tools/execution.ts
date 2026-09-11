import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import Ajv from "ajv";
import { httpToolConfig, toolEncryptionConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { decryptToolSecret } from "./secrets";

export type HttpToolFailureCode =
  | "DENIED"
  | "HTTP"
  | "NETWORK"
  | "OVERSIZED_RESULT"
  | "TIMEOUT"
  | "VALIDATION";

export class HttpToolFailure extends Error {
  constructor(readonly code: HttpToolFailureCode) {
    super("HTTP Tool failed.");
    this.name = "HttpToolFailure";
  }
}

type ExecutionDependencies = { fetch?: typeof fetch; resolve?: typeof lookup };

export async function executeHttpTool(
  input: {
    explicitCustomerRequest?: boolean;
    input: unknown;
    ticketId: string;
    toolId: string;
  },
  dependencies: ExecutionDependencies = {},
) {
  const ticket = await prisma.ticket.findFirst({
    select: { aiAgentId: true },
    where: { id: input.ticketId },
  });
  if (!ticket?.aiAgentId) throw new HttpToolFailure("DENIED");
  const tool = await prisma.tool.findFirst({
    include: { httpConfig: true },
    where: {
      assignments: { some: { aiAgentId: ticket.aiAgentId } },
      enabled: true,
      id: input.toolId,
      origin: "HTTP",
    },
  });
  if (!tool?.httpConfig || (tool.risk === "MUTATING" && !input.explicitCustomerRequest)) {
    throw new HttpToolFailure("DENIED");
  }
  try {
    if (!new Ajv({ strict: true }).compile(tool.inputSchema as object)(input.input)) {
      throw new HttpToolFailure("VALIDATION");
    }
  } catch (error) {
    if (error instanceof HttpToolFailure) throw error;
    throw new HttpToolFailure("VALIDATION");
  }

  const request = serializeRequest(
    tool.httpConfig.method,
    tool.httpConfig.url,
    input.input,
    decryptHeaders(tool.httpConfig),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), httpToolConfig.timeoutMs);
  try {
    const attempts = tool.risk === "READ_ONLY" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await safeFetch(request, controller.signal, dependencies);
        if (!response.ok) {
          if (attempt + 1 < attempts && response.status >= 500) continue;
          throw new HttpToolFailure("HTTP");
        }
        return await readLimited(response);
      } catch (error) {
        if (error instanceof HttpToolFailure && error.code !== "NETWORK") throw error;
        if (attempt + 1 === attempts) throw new HttpToolFailure("NETWORK");
      }
    }
    throw new HttpToolFailure("NETWORK");
  } catch (error) {
    if (controller.signal.aborted) throw new HttpToolFailure("TIMEOUT");
    throw error instanceof HttpToolFailure ? error : new HttpToolFailure("NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}

function decryptHeaders(config: {
  bearerTokenEncrypted: string | null;
  secretHeadersEncrypted: string | null;
}) {
  const headers: Record<string, string> = {};
  if (config.bearerTokenEncrypted) {
    headers.authorization = `Bearer ${decryptToolSecret(config.bearerTokenEncrypted, toolEncryptionConfig.masterKey)}`;
  }
  if (config.secretHeadersEncrypted) {
    Object.assign(
      headers,
      JSON.parse(decryptToolSecret(config.secretHeadersEncrypted, toolEncryptionConfig.masterKey)),
    );
  }
  return headers;
}

function serializeRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  configuredUrl: string,
  input: unknown,
  headers: Record<string, string>,
) {
  const url = new URL(configuredUrl);
  if (method === "GET") {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new HttpToolFailure("VALIDATION");
    for (const [key, value] of Object.entries(input)) {
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    return { headers, method, url };
  }
  return {
    body: JSON.stringify(input),
    headers: { ...headers, "content-type": "application/json" },
    method,
    url,
  };
}

async function safeFetch(
  request: { body?: string; headers: Record<string, string>; method: string; url: URL },
  signal: AbortSignal,
  dependencies: ExecutionDependencies,
) {
  const fetcher = dependencies.fetch ?? fetch;
  let url = request.url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertSafeDestination(url, dependencies.resolve ?? lookup);
    let response: Response;
    try {
      response = await fetcher(url, { ...request, redirect: "manual", signal });
    } catch {
      throw new HttpToolFailure("NETWORK");
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 5) throw new HttpToolFailure("HTTP");
    const redirectUrl = new URL(location, url);
    if (redirectUrl.origin !== url.origin) throw new HttpToolFailure("NETWORK");
    await response.body?.cancel();
    url = redirectUrl;
  }
  throw new HttpToolFailure("HTTP");
}

async function assertSafeDestination(url: URL, resolver: typeof lookup) {
  const localHttpAllowed = httpToolConfig.allowLocalHttp && url.protocol === "http:";
  if (url.protocol !== "https:" && !localHttpAllowed) throw new HttpToolFailure("NETWORK");
  if (url.username || url.password) throw new HttpToolFailure("NETWORK");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolver(hostname, { all: true, verbatim: true }).catch(() => {
        throw new HttpToolFailure("NETWORK");
      });
  if (
    !addresses.length ||
    (!localHttpAllowed && addresses.some(({ address }) => isUnsafeAddress(address)))
  ) {
    throw new HttpToolFailure("NETWORK");
  }
}

function isUnsafeAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isUnsafeAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

async function readLimited(response: Response) {
  if (Number(response.headers.get("content-length")) > httpToolConfig.maxResultBytes) {
    throw new HttpToolFailure("OVERSIZED_RESULT");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > httpToolConfig.maxResultBytes) {
      await reader.cancel();
      throw new HttpToolFailure("OVERSIZED_RESULT");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

export type HttpToolTestResult = {
  body: string;
  latencyMs: number;
  status: number;
};

/** Runs a configured HTTP Tool once against sample input so an Admin can prove it works before
 * attaching it to the AI Agent. Unlike `executeHttpTool` it is not bound to a Ticket and skips the
 * assignment, enabled, and MUTATING gates — nothing here reaches a Customer — but it keeps the
 * schema validation, SSRF guard, timeout, and result cap. Never retries: a test reports what
 * happened, including a 500. */
export async function testHttpTool(
  input: { input: unknown; toolId: string },
  dependencies: ExecutionDependencies = {},
): Promise<HttpToolTestResult> {
  const tool = await prisma.tool.findFirst({
    include: { httpConfig: true },
    where: { id: input.toolId, origin: "HTTP" },
  });
  if (!tool?.httpConfig) throw new HttpToolFailure("DENIED");
  try {
    if (!new Ajv({ strict: true }).compile(tool.inputSchema as object)(input.input)) {
      throw new HttpToolFailure("VALIDATION");
    }
  } catch (error) {
    if (error instanceof HttpToolFailure) throw error;
    throw new HttpToolFailure("VALIDATION");
  }

  const request = serializeRequest(
    tool.httpConfig.method,
    tool.httpConfig.url,
    input.input,
    decryptHeaders(tool.httpConfig),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), httpToolConfig.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await safeFetch(request, controller.signal, dependencies);
    return {
      body: await readLimited(response),
      latencyMs: Date.now() - startedAt,
      status: response.status,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new HttpToolFailure("TIMEOUT");
    throw error instanceof HttpToolFailure ? error : new HttpToolFailure("NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}
