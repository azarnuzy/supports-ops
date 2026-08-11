import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppI18nProvider } from "@repo/ui/i18n";
import { Toaster } from "@repo/ui/components/sonner";
import { ThemeProvider } from "@repo/ui/components/theme-selector";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@repo/ui/styles.css";
import "./styles.css";
import { i18n } from "./i18n";
import { routeTree } from "./routeTree.gen";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider storageKey="admin:theme">
      <AppI18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster richColors />
        </QueryClientProvider>
      </AppI18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
