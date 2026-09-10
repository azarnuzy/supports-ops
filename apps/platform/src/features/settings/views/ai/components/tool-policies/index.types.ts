import type { CatalogTool, TicketCategory } from "@repo/api-client";

export type ToolPoliciesProps = {
  tools: CatalogTool[];
  onChange: (category: TicketCategory, toolId: string | null) => void;
  isPending: boolean;
};
