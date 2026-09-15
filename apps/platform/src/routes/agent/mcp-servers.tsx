import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { McpServersView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/agent/mcp-servers")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "MCP Servers",
      description: "Connect and manage MCP servers available to your AI Agent.",
      path: "/agent/mcp-servers",
      noIndex: true,
    }),
  component: McpServersView,
});
