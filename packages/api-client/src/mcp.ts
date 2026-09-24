import type { ApiClient } from "./client";
import type { CatalogTool, McpDiscoveryStatus, ToolRisk } from "./tools";

export type McpServer = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  staticArguments?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type McpServerInput = {
  name: string;
  url: string;
  enabled?: boolean;
  bearerToken?: string | null;
  secretHeaders?: Record<string, string> | null;
  staticArguments?: Record<string, unknown> | null;
};

export type McpTool = {
  toolId: string;
  mcpServerId: string;
  remoteName: string;
  discoveredSchema: unknown;
  discoveredDescription: string;
  discoveryStatus: McpDiscoveryStatus;
  discoveredAt: string;
  tool: CatalogTool;
};

export class McpApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpApiError";
  }
}

async function readMcpError(response: Response, fallback: string) {
  if (response.status === 404)
    return new McpApiError("not_found", "This MCP Server no longer exists.");
  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return new McpApiError(
      "tool_denied",
      data?.message ?? "This MCP Tool can no longer be enabled.",
    );
  }
  return new Error(fallback);
}

export async function listMcpServers(client: ApiClient) {
  const response = await client["mcp-servers"].$get();
  if (response.status === 403) throw new Error("Only an Admin can manage MCP Servers.");
  if (!response.ok) throw new Error("Failed to load MCP Servers.");
  return (await response.json()) as { servers: McpServer[] };
}

export async function createMcpServer(client: ApiClient, input: McpServerInput) {
  const response = await client["mcp-servers"].$post({ json: input as never });
  if (!response.ok) throw new Error("Failed to add the MCP Server.");
  return (await response.json()) as { server: McpServer };
}

export async function updateMcpServer(
  client: ApiClient,
  id: string,
  input: Partial<McpServerInput>,
) {
  const response = await client["mcp-servers"][":id"].$patch({ json: input, param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to save the MCP Server.");
  return (await response.json()) as { data: McpServer };
}

export async function deleteMcpServer(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].$delete({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to delete the MCP Server.");
}

export async function testMcpConnection(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].test.$post({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to test the MCP Server.");
  return (await response.json()) as {
    data: { ok: true; server: unknown } | { ok: false; error: string };
  };
}

export async function discoverMcpTools(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].discover.$post({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to discover Tools.");
  return (await response.json()) as { data: McpTool[] };
}

export async function reviewMcpTool(
  client: ApiClient,
  toolId: string,
  input: { enabled: boolean; risk: ToolRisk },
) {
  const response = await client["mcp-servers"].tools[":toolId"].review.$post({
    json: input,
    param: { toolId },
  });
  if (!response.ok) throw await readMcpError(response, "Failed to review the MCP Tool.");
  return (await response.json()) as { data: McpTool };
}
