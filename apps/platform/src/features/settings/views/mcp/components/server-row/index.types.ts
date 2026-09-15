import type { McpServer } from "@repo/api-client";
import type { McpConnectionState } from "../../mcp.utils";

export type ServerRowProps = {
  server: McpServer;
  connectionState: McpConnectionState;
  activeToolCount: number | undefined;
  onOpenDetail: () => void;
  onToggleServerEnabled: (enabled: boolean) => void;
  onDelete: () => void;
};
