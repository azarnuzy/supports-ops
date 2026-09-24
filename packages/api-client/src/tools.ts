import type { ApiClient } from "./client";

export type ToolOrigin = "BUILT_IN" | "HTTP" | "MCP";
export type ToolRisk = "READ_ONLY" | "MUTATING" | "MUTATING_IRREVERSIBLE";
export type ToolAvailability = "AVAILABLE" | "UNAVAILABLE";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type McpDiscoveryStatus = "CURRENT" | "CHANGED" | "UNAVAILABLE";

export type HttpTool = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: unknown;
  risk: ToolRisk;
  method: HttpMethod;
  url: string;
  hasBearerToken: boolean;
  hasSecretHeaders: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogTool = {
  id: string;
  origin: ToolOrigin;
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: unknown;
  risk: ToolRisk;
  createdAt: string;
  updatedAt: string;
  assigned: boolean;
  availability: ToolAvailability;
  lastCall: { at: string; succeeded: boolean } | null;
  usageInstruction: string | null;
};

export type HttpToolTestResult =
  | { ok: true; body: string; latencyMs: number; status: number }
  | {
      ok: false;
      code: "DENIED" | "HTTP" | "NETWORK" | "OVERSIZED_RESULT" | "TIMEOUT" | "VALIDATION";
    };

export type ToolCall = {
  at: string;
  latencyMs: number;
  succeeded: boolean;
  ticketId: string;
};

export type ToolCallLog = {
  calls: ToolCall[];
  stats: { avgLatencyMs: number; failed: number; total: number };
};

export type HttpToolInput = {
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: Record<string, unknown>;
  method: HttpMethod;
  url: string;
  risk: ToolRisk;
  bearerToken?: string | null;
  secretHeaders?: Record<string, string> | null;
};

export class ToolApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

async function readToolError(response: Response, fallback: string) {
  if (response.status === 404) return new ToolApiError("not_found", "This Tool no longer exists.");
  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (data?.error === "tool_unavailable")
      return new ToolApiError(
        data?.error ?? "tool_unavailable",
        "This Tool is not available to assign.",
      );
    if (data?.error === "tool_not_assigned")
      return new ToolApiError(
        data?.error ?? "tool_not_assigned",
        "Switch this Tool on for the AI Agent first.",
      );
  }
  if (response.status === 422) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return new ToolApiError("invalid_schema", data?.message ?? "The input schema is invalid.");
  }
  return new Error(fallback);
}

export async function listHttpTools(client: ApiClient) {
  const response = await client.tools.$get({ query: {} });
  if (response.status === 403) throw new Error("Only an Admin can manage Tools.");
  if (!response.ok) throw new Error("Failed to load Tools.");
  return (await response.json()) as { tools: HttpTool[] };
}

export async function listCatalogTools(client: ApiClient, aiAgentId: string) {
  const response = await client.tools.$get({ query: { aiAgentId } });
  if (response.status === 403) throw new Error("Only an Admin can manage Tools.");
  if (!response.ok) throw new Error("Failed to load Tools.");
  return (await response.json()) as { tools: CatalogTool[] };
}

export async function getHttpTool(client: ApiClient, id: string) {
  const response = await client.tools[":id"].$get({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to load the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function createHttpTool(client: ApiClient, input: HttpToolInput) {
  const response = await client.tools.$post({ json: input });
  if (!response.ok) throw await readToolError(response, "Failed to create the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function updateHttpTool(client: ApiClient, id: string, input: HttpToolInput) {
  const response = await client.tools[":id"].$put({ json: input, param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to save the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function listToolCalls(client: ApiClient, id: string) {
  const response = await client.tools[":id"].logs.$get({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to load the tool logs.");
  return (await response.json()) as ToolCallLog;
}

export async function testHttpTool(client: ApiClient, id: string, input: Record<string, unknown>) {
  const response = await client.tools[":id"].test.$post({ json: { input }, param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to test the Webhook.");
  return (await response.json()) as { result: HttpToolTestResult };
}

export async function deleteHttpTool(client: ApiClient, id: string) {
  const response = await client.tools[":id"].$delete({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to delete the HTTP Tool.");
}

export async function setToolEnabled(client: ApiClient, toolId: string, enabled: boolean) {
  const response = await client.tools[":toolId"].$patch({
    json: { enabled },
    param: { toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to update the Tool.");
  return (await response.json()) as { tool: CatalogTool };
}

export async function setToolAssignment(
  client: ApiClient,
  toolId: string,
  aiAgentId: string,
  assigned: boolean,
) {
  const response = await client.tools[":toolId"].assignments[":aiAgentId"].$put({
    json: { assigned },
    param: { aiAgentId, toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to update the Tool assignment.");
}

export async function setToolUsageInstruction(
  client: ApiClient,
  toolId: string,
  aiAgentId: string,
  usageInstruction: string | null,
) {
  const response = await client.tools[":toolId"].instructions[":aiAgentId"].$put({
    json: { usageInstruction },
    param: { aiAgentId, toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to save when to use this Tool.");
}
