import { UnauthorizedApiError } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { operatorQuery, signOut } from "../../lib/auth";

export const sections = [
  { label: "Overview", slug: "" },
  { label: "Workspaces", slug: "workspaces" },
  { label: "At-risk", slug: "at-risk" },
  { label: "Payments", slug: "payments" },
  { label: "Model margin", slug: "model-margin" },
  { label: "Action log", slug: "action-log" },
] as const;

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const session = useQuery(operatorQuery);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.error instanceof UnauthorizedApiError) {
      queryClient.removeQueries({ queryKey: operatorQuery.queryKey });
      void navigate({ to: "/login" });
    }
  }, [session.error, navigate, queryClient]);

  async function logout() {
    setError("");
    try {
      await signOut();
      queryClient.removeQueries({ queryKey: operatorQuery.queryKey });
      await navigate({ to: "/login" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.");
    }
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b bg-card p-4 md:min-h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <Link to="/" className="text-lg font-semibold">
          SupportOps <span className="text-sm font-normal text-muted-foreground">Console</span>
        </Link>
        <nav aria-label="Console" className="mt-8 flex gap-1 overflow-x-auto md:flex-col">
          {sections.map(({ label, slug }) => {
            const active = location.pathname === (slug ? `/${slug}` : "/");
            const className =
              "whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium";
            return slug ? (
              <Link key={label} to="/$section" params={{ section: slug }} aria-current={active ? "page" : undefined} className={className}>
                {label}
              </Link>
            ) : (
              <Link key={label} to="/" aria-current={active ? "page" : undefined} className={className}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b px-6">
          <span className="text-sm text-muted-foreground">{session.data?.email}</span>
          <Button type="button" variant="outline" onClick={logout}>
            Sign out
          </Button>
        </header>
        {error && (
          <p role="alert" className="px-6 pt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
