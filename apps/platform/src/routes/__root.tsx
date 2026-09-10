import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import { pageMetadata } from "../lib/seo";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () =>
    pageMetadata({
      title: "AI-first customer support",
      description:
        "SupportOps helps Workspaces resolve customer support with an AI Agent and Human Agents.",
      path: "/",
    }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeadContent />
      <Outlet />
    </div>
  );
}
