import { QueryClient } from "@tanstack/react-query";

/** Every list and detail query in the platform is kept fresh by SSE, so
 * refetching on mount and on window focus only repeated work the server had
 * already pushed — one navigation fired three serialised waves of requests.
 * `staleTime` collapses those waves; an event that actually changes data still
 * invalidates explicitly. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});
