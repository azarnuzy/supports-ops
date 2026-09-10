import type { CatalogTool } from "@repo/api-client";

export type ToolAssignmentsProps = {
  tools: CatalogTool[];
  onToggle: (toolId: string, assigned: boolean) => void;
  isPending: boolean;
};
