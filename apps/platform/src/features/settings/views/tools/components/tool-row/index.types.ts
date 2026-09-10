import type { CatalogTool } from "@repo/api-client";

export type ToolRowProps = {
  tool: CatalogTool;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
};
