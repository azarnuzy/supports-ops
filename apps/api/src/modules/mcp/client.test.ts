import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withMcpClient } from "./client";

function fixture() {
  const app = new Hono();
  app.all("/mcp", async (c) => {
    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool(
      "echo",
      { description: "Echo text", inputSchema: { text: z.string() } },
      async ({ text }) => ({ content: [{ text, type: "text" }] }),
    );
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
  return app;
}

describe("MCP Streamable HTTP client", () => {
  it("initializes, discovers Tools, and executes one through a local protocol fixture", async () => {
    const app = fixture();
    const result = await withMcpClient(
      "http://localhost/mcp",
      {},
      async (client) => ({
        call: await client.callTool({ arguments: { text: "hello" }, name: "echo" }),
        server: client.getServerVersion(),
        tools: await client.listTools(),
      }),
      { allowPrivateNetwork: true, fetch: app.fetch },
    );

    expect(result.server?.name).toBe("fixture");
    expect(result.tools.tools).toEqual([
      expect.objectContaining({ description: "Echo text", name: "echo" }),
    ]);
    expect(result.call.content).toEqual([{ text: "hello", type: "text" }]);
  });

  it("denies insecure and private endpoints by default", async () => {
    await expect(withMcpClient("http://127.0.0.1/mcp", {}, async () => null)).rejects.toThrow(
      "HTTPS",
    );
    await expect(withMcpClient("https://127.0.0.1/mcp", {}, async () => null)).rejects.toThrow(
      "private network",
    );
  });
});
