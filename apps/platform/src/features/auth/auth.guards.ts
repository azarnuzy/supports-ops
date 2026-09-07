import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "./auth.hooks";
import { UnauthorizedError } from "./auth.services";
export async function requireAuth({ context }: { context: { queryClient: QueryClient } }) {
  try {
    await context.queryClient.ensureQueryData(meQueryOptions);
  } catch (error) {
    if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
    throw error;
  }
}

export async function requireAdmin({ context }: { context: { queryClient: QueryClient } }) {
  try {
    const user = await context.queryClient.ensureQueryData(meQueryOptions);

    if (user.role !== "ADMIN") {
      throw redirect({ to: "/" });
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
    throw error;
  }
}
