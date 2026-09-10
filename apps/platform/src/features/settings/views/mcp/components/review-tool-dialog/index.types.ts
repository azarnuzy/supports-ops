import type { McpTool, ToolRisk } from "@repo/api-client";

export type ReviewToolDialogProps = {
  tool: McpTool | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (enabled: boolean, risk: ToolRisk) => void;
  isPending: boolean;
};
