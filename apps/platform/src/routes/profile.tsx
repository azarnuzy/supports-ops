import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../features/auth";
import { ProfileView } from "../features/profile";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/profile")({
  head: () =>
    pageMetadata({
      title: "Profile settings",
      description: "Manage your SupportOps profile settings.",
      path: "/profile",
      noIndex: true,
    }),
  beforeLoad: requireAuth,
  component: ProfileView,
});
