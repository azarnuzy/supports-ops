import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { TicketCategoriesView } from "../../features/ticket-categories";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/workspace/categories")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Ticket categories",
      description: "Define the categories the AI Agent sorts conversations into.",
      path: "/workspace/categories",
      noIndex: true,
    }),
  component: TicketCategoriesView,
});
