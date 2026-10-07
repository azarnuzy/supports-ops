import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { email: string; token: string } => ({
    email: typeof search.email === "string" ? search.email : "",
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () =>
    pageMetadata({
      title: "Reset password",
      description: "Choose a new SupportOps password.",
      path: "/reset-password",
      noIndex: true,
    }),
  component: ResetPasswordView,
});
