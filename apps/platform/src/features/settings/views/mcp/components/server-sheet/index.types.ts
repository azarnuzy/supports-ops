import type { McpServer, McpTool } from "@repo/api-client";
import type { McpConnectionState } from "../../mcp.utils";

export type ServerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: McpServer | null;
  connectionState: McpConnectionState;
  /** Undefined until Tools have been discovered at least once in this session. */
  tools: McpTool[] | undefined;
  lastTest: { ok: boolean; message?: string } | undefined;
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
