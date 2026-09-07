import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { HumanAgentsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/settings/agents")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Human Agents",
      description: "Create and manage Human Agent accounts in your SupportOps Workspace.",
      path: "/settings/agents",
      noIndex: true,
    }),
  component: HumanAgentsView,
});
