import type { McpTool } from "@repo/api-client";

export type DiscoveredToolRowProps = {
  tool: McpTool;
  onToggleEnabled: (enabled: boolean) => void;
  onReview: () => void;
};
