import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { ToolsSettingsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/settings/tools")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Tools",
      description: "Manage Built-in, HTTP, and MCP Tools.",
      path: "/settings/tools",
      noIndex: true,
    }),
  component: ToolsSettingsView,
});
