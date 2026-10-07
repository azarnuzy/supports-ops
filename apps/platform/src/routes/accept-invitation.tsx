import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvitationView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/accept-invitation")({
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () =>
    pageMetadata({
      title: "Accept your Invitation",
      description: "Join a SupportOps Workspace.",
      path: "/accept-invitation",
      noIndex: true,
    }),
  component: AcceptInvitationView,
});
