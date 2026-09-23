import { UnauthorizedApiError } from "@repo/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, redirect } from "@tanstack/react-router";
import { operatorQuery } from "../lib/auth";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    if (location.pathname === "/login") return;
    try {
      await context.queryClient.fetchQuery(operatorQuery);
    } catch (error) {
      if (error instanceof UnauthorizedApiError) throw redirect({ to: "/login" });
      throw error;
    }
  },
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
