import { hc } from "hono/client";
import type { AppType } from "@repo/api";

export function createApiClient(baseUrl: string) {
  return hc<AppType>(baseUrl, {
    init: {
      credentials: "include",
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
