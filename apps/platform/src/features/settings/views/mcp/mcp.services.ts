import {
  createApiClient,
  createMcpServer,
  deleteMcpServer,
  discoverMcpTools,
  listMcpServers,
  reviewMcpTool,
  setToolEnabled,
  testMcpConnection,
  updateMcpServer,
  type McpServerInput,
  type ToolRisk,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getMcpServers() {
  return listMcpServers(apiClient);
}

export function createServer(input: McpServerInput) {
  return createMcpServer(apiClient, input);
}

export function updateServer({ id, input }: { id: string; input: Partial<McpServerInput> }) {
  return updateMcpServer(apiClient, id, input);
}

export function deleteServer(id: string) {
  return deleteMcpServer(apiClient, id);
}

export function testConnection(id: string) {
  return testMcpConnection(apiClient, id);
}

export function discoverTools(id: string) {
  return discoverMcpTools(apiClient, id);
}

export function reviewTool({
  toolId,
  enabled,
  risk,
}: {
  toolId: string;
  enabled: boolean;
  risk: ToolRisk;
}) {
  return reviewMcpTool(apiClient, toolId, { enabled, risk });
}

export function toggleToolEnabled({ toolId, enabled }: { toolId: string; enabled: boolean }) {
  return setToolEnabled(apiClient, toolId, enabled);
}
