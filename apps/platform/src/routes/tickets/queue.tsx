import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../features/auth";
import { SharedHumanQueueView } from "../../features/tickets";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/tickets/queue")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "Shared Human Queue",
      description: "Claim escalated Tickets in SupportOps.",
      path: "/tickets/queue",
      noIndex: true,
    }),
  component: SharedHumanQueueView,
});
