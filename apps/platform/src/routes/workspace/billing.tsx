import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { BillingView } from "../../features/billing";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/workspace/billing")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Billing",
      description: "Credit balance, Top-Up Packs, and payment history.",
      path: "/workspace/billing",
      noIndex: true,
    }),
  component: BillingView,
});
