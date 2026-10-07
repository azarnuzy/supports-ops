import { createFileRoute } from "@tanstack/react-router";
import { VerifyEmailView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/verify-email")({
  head: () =>
    pageMetadata({
      title: "Verify your email",
      description: "Confirm your email address for SupportOps.",
      path: "/verify-email",
      noIndex: true,
    }),
  component: VerifyEmailView,
});
