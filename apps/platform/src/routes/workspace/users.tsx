import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { UsersView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/workspace/users")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Users",
      description: "Invite and manage the people who work in this Workspace.",
      path: "/workspace/users",
      noIndex: true,
    }),
  component: UsersView,
});
