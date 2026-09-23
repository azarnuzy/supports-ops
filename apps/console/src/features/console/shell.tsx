import { UnauthorizedApiError } from "@repo/api-client";
import { AppShell, type AppShellNavSection } from "@repo/layouts/app-shell";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@repo/ui/components/sidebar";
import { ThemeSelector } from "@repo/ui/components/theme-selector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ClipboardListIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  LogOutIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { operatorQuery, signOut } from "../../lib/auth";

export const sections = [
  { group: "Monitor", icon: LayoutDashboardIcon, label: "Overview", slug: "" },
  { group: "Monitor", icon: UsersIcon, label: "Workspaces", slug: "workspaces" },
  { group: "Monitor", icon: AlertTriangleIcon, label: "Needs Attention", slug: "needs-attention" },
  {
    group: "Monitor",
    icon: LineChartIcon,
    label: "Platform Analytics",
    slug: "platform-analytics",
  },
  {
    group: "Finance",
    icon: CreditCardIcon,
    label: "Billing & Credits",
    slug: "billing-credits",
  },
  {
    group: "Finance",
    icon: LineChartIcon,
    label: "AI Usage & Economics",
    slug: "ai-usage-economics",
  },
  { group: "Governance", icon: ClipboardListIcon, label: "Audit Log", slug: "audit-log" },
] as const;

export const legacySectionAliases: Record<string, string> = {
  "at-risk": "needs-attention",
  payments: "billing-credits",
  "model-margin": "ai-usage-economics",
  "action-log": "audit-log",
};

const navGroups = ["Monitor", "Finance", "Governance"] as const;

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

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

  const currentSlug = location.pathname.split("/")[1] ?? "";
  const activeSlug = legacySectionAliases[currentSlug] ?? currentSlug;
  const navSections: AppShellNavSection[] = navGroups.map((group) => ({
    label: group,
    items: sections
      .filter((section) => section.group === group)
      .map(({ icon, label, slug }) => ({
        active: activeSlug === slug,
        icon,
        label,
        to: slug ? `/${slug}` : "/",
      })),
  }));

  const footer = (
    <SidebarMenu className="rounded-lg border bg-background p-1 group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <div className="flex items-center group-data-[collapsible=icon]:flex-col">
          <SidebarMenuButton size="lg" className="flex-1" tabIndex={-1} tooltip="Operator">
            <Avatar className="shrink-0 rounded-md">
              <AvatarFallback className="rounded-md">
                {session.data ? getInitials(session.data.email) : ""}
              </AvatarFallback>
            </Avatar>
            <span className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{session.data?.email}</span>
            </span>
          </SidebarMenuButton>
          <Button
            aria-label="Sign out"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            size="icon"
            title="Sign out"
            type="button"
            variant="ghost"
            onClick={logout}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );

  return (
    <AppShell
      brand={{ name: "Console", to: "/" }}
      footer={footer}
      fullWidth
      headerRight={
        <ThemeSelector
          ariaLabel="Theme"
          labels={{ dark: "Dark", light: "Light", system: "System" }}
        />
      }
      navSections={navSections}
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {children}
    </AppShell>
  );
}
