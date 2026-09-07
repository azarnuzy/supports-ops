import { createFileRoute } from "@tanstack/react-router";
import { RegisterView } from "../../../features/auth";
import { pageMetadata } from "../../../lib/seo";
export const Route = createFileRoute("/auth/v2/register")({
  head: () =>
    pageMetadata({
      title: "Create a Workspace",
      description: "Create your SupportOps Workspace account.",
      path: "/auth/v2/register",
      noIndex: true,
    }),
  component: RegisterView,
});
