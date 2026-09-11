import type { McpServer } from "@repo/api-client";

export type ServerRowProps = {
  server: McpServer;
  activeToolCount: number | undefined;
  onOpenDetail: () => void;
  onToggleServerEnabled: (enabled: boolean) => void;
  onDelete: () => void;
};
