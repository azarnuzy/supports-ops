import { createFileRoute } from "@tanstack/react-router";
import { CheckInboxView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/check-inbox")({
  validateSearch: (search: Record<string, unknown>): { email: string } => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  head: () =>
    pageMetadata({
      title: "Check your inbox",
      description: "Verify your email to finish creating your Workspace.",
      path: "/check-inbox",
      noIndex: true,
    }),
  component: CheckInboxView,
});
