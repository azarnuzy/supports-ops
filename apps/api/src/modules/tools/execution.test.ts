import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ticketFindFirst: vi.fn(), toolFindFirst: vi.fn() }));

vi.mock("../../utils/prisma", () => ({
  prisma: {
    ticket: { findFirst: mocks.ticketFindFirst },
    tool: { findFirst: mocks.toolFindFirst },
  },
}));
vi.mock("../../config", () => ({
  httpToolConfig: { allowLocalHttp: false, maxResultBytes: 65_536, timeoutMs: 10 },
  toolEncryptionConfig: { masterKey: "key" },
}));
vi.mock("./secrets", () => ({ decryptToolSecret: (value: string) => value }));

const { executeHttpTool, HttpToolFailure, testHttpTool } = await import("./execution");
const resolvePublic = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) as never;

function configuredTool(overrides: Record<string, unknown> = {}) {
  return {
    httpConfig: {
      bearerTokenEncrypted: "token",
      method: "GET",
      secretHeadersEncrypted: '{"x-api-key":"secret"}',
      url: "https://example.com/run",
    },
    inputSchema: {
      additionalProperties: false,
      properties: { customerId: { type: "string" } },
      required: ["customerId"],
      type: "object",
    },
    risk: "READ_ONLY",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.ticketFindFirst.mockReset().mockResolvedValue({ aiAgentId: "ai-1" });
  mocks.toolFindFirst.mockReset().mockResolvedValue(configuredTool());
});

describe("executeHttpTool", () => {
  it("serializes validated GET input and applies decrypted secrets", async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}')) as never;
    await expect(
      executeHttpTool(
        { input: { customerId: "customer 1" }, ticketId: "ticket-1", toolId: "tool-1" },
        { fetch: fetcher, resolve: resolvePublic },
      ),
    ).resolves.toBe('{"ok":true}');
    const [url, options] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(url.searchParams.get("customerId")).toBe("customer 1");
    expect(options.headers).toEqual({ authorization: "Bearer token", "x-api-key": "secret" });
  });

  it("sends mutating input as JSON and never retries", async () => {
    mocks.toolFindFirst.mockResolvedValue(
      configuredTool({
        httpConfig: { ...configuredTool().httpConfig, method: "POST" },
        risk: "MUTATING",
      }),
    );
    const fetcher = vi.fn(async () => new Response("failed", { status: 500 })) as never;
    await expect(
      executeHttpTool(
        {
          explicitCustomerRequest: true,
          input: { customerId: "c-1" },
          ticketId: "ticket-1",
          toolId: "tool-1",
        },
        { fetch: fetcher, resolve: resolvePublic },
      ),
    ).rejects.toMatchObject({ code: "HTTP", message: "HTTP Tool failed." });
    expect(fetcher).toHaveBeenCalledOnce();
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      body: '{"customerId":"c-1"}',
      method: "POST",
    });
  });

  it("rejects invalid input and unassigned execution before fetch", async () => {
    const fetcher = vi.fn();
    await expect(
      executeHttpTool(
        { input: {}, ticketId: "ticket-1", toolId: "tool-1" },
        { fetch: fetcher as never, resolve: resolvePublic },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    mocks.toolFindFirst.mockResolvedValue(null);
    await expect(
      executeHttpTool(
        { input: { customerId: "c-1" }, ticketId: "ticket-1", toolId: "tool-1" },
        { fetch: fetcher as never, resolve: resolvePublic },
      ),
    ).rejects.toMatchObject({ code: "DENIED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks private destinations reached through redirects", async () => {
    const fetcher = vi.fn(async () =>
      Response.redirect("https://127.0.0.1/metadata", 302),
    ) as never;
    await expect(
      executeHttpTool(
        { input: { customerId: "c-1" }, ticketId: "ticket-1", toolId: "tool-1" },
        { fetch: fetcher, resolve: resolvePublic },
      ),
    ).rejects.toMatchObject({ code: "NETWORK", message: "HTTP Tool failed." });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects oversized results and timeouts with redacted failures", async () => {
    await expect(
      executeHttpTool(
        { input: { customerId: "c-1" }, ticketId: "ticket-1", toolId: "tool-1" },
        {
          fetch: vi.fn(async () => new Response("x".repeat(65_537))) as never,
          resolve: resolvePublic,
        },
      ),
    ).rejects.toMatchObject({ code: "OVERSIZED_RESULT", message: "HTTP Tool failed." });

    const hangingFetch = vi.fn(
      (_url, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          options.signal?.addEventListener("abort", () =>
            reject(new Error("secret network error")),
          ),
        ),
    ) as never;
    await expect(
      executeHttpTool(
        { input: { customerId: "c-1" }, ticketId: "ticket-1", toolId: "tool-1" },
        { fetch: hangingFetch, resolve: resolvePublic },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT", message: "HTTP Tool failed." });
  });
});

describe("testHttpTool", () => {
  it("reports status, body, and latency without needing a Ticket or an assignment", async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200 })) as never;
    const result = await testHttpTool(
      { input: { customerId: "customer-1" }, toolId: "tool-1" },
      { fetch: fetcher, resolve: resolvePublic },
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mocks.ticketFindFirst).not.toHaveBeenCalled();
  });

  it("reports a failing status instead of retrying or throwing HTTP", async () => {
    const fetcher = vi.fn(async () => new Response("boom", { status: 500 })) as never;
    const result = await testHttpTool(
      { input: { customerId: "customer-1" }, toolId: "tool-1" },
      { fetch: fetcher, resolve: resolvePublic },
    );
    expect(result.status).toBe(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects input that does not match the schema", async () => {
    await expect(
      testHttpTool({ input: { wrong: 1 }, toolId: "tool-1" }, { resolve: resolvePublic }),
    ).rejects.toThrow(HttpToolFailure);
  });

  it("runs a MUTATING Tool that executeHttpTool would deny", async () => {
    mocks.toolFindFirst.mockResolvedValue(configuredTool({ risk: "MUTATING" }));
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 })) as never;
    await expect(
      testHttpTool(
        { input: { customerId: "customer-1" }, toolId: "tool-1" },
        { fetch: fetcher, resolve: resolvePublic },
      ),
    ).resolves.toMatchObject({ status: 200 });
  });
});
