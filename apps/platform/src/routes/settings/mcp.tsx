import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { McpServersSettingsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/settings/mcp")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "MCP Servers",
      description: "Connect and manage remote MCP Servers.",
      path: "/settings/mcp",
      noIndex: true,
    }),
  component: McpServersSettingsView,
});
