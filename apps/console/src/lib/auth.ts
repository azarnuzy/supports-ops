import { UnauthorizedApiError } from "@repo/api-client";
import { queryOptions } from "@tanstack/react-query";
import { api, apiBaseUrl } from "./api";

export const operatorQuery = queryOptions({
  queryKey: ["operator"],
  queryFn: async () => {
    const response = await api.operator.session.$get();
    if (response.status === 401) throw new UnauthorizedApiError();
    if (!response.ok) throw new Error("Failed to load Operator session.");
    return (await response.json()).operator;
  },
  retry: false,
  refetchInterval: 60_000,
});

async function authRequest(path: string, body?: object) {
  const response = await fetch(`${apiBaseUrl}/operator/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(result?.message ?? "Authentication failed.");
  }
}

export function signIn(email: string, password: string) {
  return authRequest("sign-in/email", { email, password });
}

export function signOut() {
  return authRequest("sign-out");
}
