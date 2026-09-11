import type { CatalogTool } from "@repo/api-client";

export type SystemToolsCardProps = {
  /** Built-in Tools reported by the API; the fixed capabilities below are always shown. */
  tools: CatalogTool[];
};
