import type { CatalogTool } from "@repo/api-client";

export type ToolRowProps = {
  tool: CatalogTool;
  /** Enables the Tool for the AI Agent. One switch covers both enabling and attaching. */
  onToggleAttached: (attached: boolean) => void;
  isToggling?: boolean;
  onOpenDetail: () => void;
  onDelete?: () => void;
};
