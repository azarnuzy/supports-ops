import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { ToolsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/agent/tools")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Tools",
      description: "Webhooks, MCP servers, and system tools available to your AI Agent.",
      path: "/agent/tools",
      noIndex: true,
    }),
  component: ToolsView,
});
