import type { McpServer, McpTool } from "@repo/api-client";

export type ServerRowProps = {
  server: McpServer;
  tools: McpTool[] | undefined;
  isTesting: boolean;
  isDiscovering: boolean;
  onTest: () => void;
  onDiscover: () => void;
  onToggleServerEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleToolEnabled: (toolId: string, enabled: boolean) => void;
  onReviewTool: (tool: McpTool) => void;
};
