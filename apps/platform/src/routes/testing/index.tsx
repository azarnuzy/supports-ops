import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { TestingView } from "../../features/testing";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/testing/")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Testing",
      description: "Author Eval Datasets to check your AI Agent.",
      path: "/testing",
      noIndex: true,
    }),
  component: TestingView,
});
