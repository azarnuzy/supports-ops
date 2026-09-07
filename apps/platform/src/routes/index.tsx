import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../features/auth";
import { DashboardView } from "../features/dashboard";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    pageMetadata({
      title: "Workspace dashboard",
      description: "Review your SupportOps Workspace dashboard.",
      path: "/",
      noIndex: true,
    }),
  beforeLoad: requireAuth,
  component: DashboardView,
});
