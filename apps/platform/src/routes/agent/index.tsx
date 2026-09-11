import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { AiAgentView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/agent/")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "AI Agent",
      description: "Instructions, handoff messages, and routing rules for your AI Agent.",
      path: "/agent",
      noIndex: true,
    }),
  component: AiAgentView,
});
