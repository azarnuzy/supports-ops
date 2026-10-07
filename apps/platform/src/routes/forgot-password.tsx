import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    pageMetadata({
      title: "Forgot password",
      description: "Request a link to reset your SupportOps password.",
      path: "/forgot-password",
      noIndex: true,
    }),
  component: ForgotPasswordView,
});
