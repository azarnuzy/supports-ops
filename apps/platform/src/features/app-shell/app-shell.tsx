import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@repo/ui/components/sidebar";
import { toast } from "@repo/ui/components/sonner";
import { AppShell, type AppShellNavSection } from "@repo/layouts/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BotIcon,
  ChartColumnIcon,
  CoinsIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  LibraryBigIcon,
  LogOutIcon,
  MessageCircleIcon,
  MessageSquareCodeIcon,
  PlugIcon,
  TagsIcon,
  TicketCheckIcon,
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { meQueryOptions, useLogoutMutation } from "../auth";
import { getInitials } from "../../lib/utils";
import { HeaderControls } from "./components/header-controls";

type NavItem = {
  icon: LucideIcon;
  label: string;
  /** Subtrees this item owns; defaults to [`to`]. */
  owns?: string[];
  /** Subtrees owned by sibling items that this one must never claim. */
  notUnder?: string[];
  to: string;
};

type NavSection = { collapsible?: boolean; items: NavItem[]; label?: string };

/** The deepest matching item owns `pathname`; `notUnder` carves out sibling-owned subtrees. */
function activeNavItemTo(pathname: string, items: NavItem[]) {
  let best: NavItem | undefined;
  for (const item of items) {
    if (item.notUnder?.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
      continue;
    }
    const ownedSubtrees = item.owns ?? [item.to];
    const owned = ownedSubtrees.some((base) =>
      base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`),
    );
    if (owned && (!best || item.to.length > best.to.length)) {
      best = item;
    }
  }
  return best?.to;
}

export function PlatformAppShell({
  children,
  fullBleed = false,
  fullWidth = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  fullWidth?: boolean;
}) {
  const location = useLocation();
  const user = useQuery(meQueryOptions);
  const logoutMutation = useLogoutMutation();

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onError: (error) => {
        const message = error instanceof Error ? error.message : "Failed to log out.";
        toast.error(message);
      },
    });
  }

  if (!user.data) {
    return null;
  }

  const conversationItems: NavItem[] = [
    {
      icon: InboxIcon,
      label: "Mine",
      notUnder: ["/chat/ai-live"],
      to: "/chat",
    },
    { icon: TicketCheckIcon, label: "Unassigned", to: "/chat/unassigned" },
  ];
  const navSections: NavSection[] =
    user.data.role === "ADMIN"
      ? [
          {
            items: [{ icon: LayoutDashboardIcon, label: "Dashboard", to: "/" }],
            label: "Overview",
          },
          {
            collapsible: true,
            items: [
              ...conversationItems,
              { icon: LayoutListIcon, label: "All Conversations", to: "/chat/all" },
            ],
            label: "Conversations",
          },
          {
            items: [
              { icon: BotIcon, label: "AI Agent", to: "/agent" },
              { icon: WrenchIcon, label: "Tools", to: "/agent/tools" },
              { icon: PlugIcon, label: "MCP Servers", to: "/agent/mcp-servers" },
              { icon: LibraryBigIcon, label: "Knowledge", to: "/knowledge" },
            ],
            label: "Configure",
          },
          {
            items: [
              { icon: MessageSquareCodeIcon, label: "Web Widget", to: "/channels/web-widget" },
              { icon: MessageCircleIcon, label: "WhatsApp", to: "/channels/whatsapp" },
            ],
            label: "Channels",
          },
          {
            items: [
              { icon: UsersRoundIcon, label: "Users", to: "/workspace/users" },
              { icon: TagsIcon, label: "Ticket categories", to: "/workspace/categories" },
              { icon: ChartColumnIcon, label: "AI Usage", to: "/workspace/ai-usage" },
              { icon: CoinsIcon, label: "Billing", to: "/workspace/billing" },
            ],
            label: "Workspace",
          },
        ]
      : [{ collapsible: true, items: conversationItems, label: "Conversations" }];

  const activeTo = activeNavItemTo(
    location.pathname,
    navSections.flatMap((section) => section.items),
  );

  const shellNavSections: AppShellNavSection[] = navSections.map((section) => ({
    collapsible: section.collapsible,
    items: section.items.map((item) => ({ ...item, active: item.to === activeTo })),
    label: section.label,
  }));

  const footer = (
    <SidebarMenu className="rounded-lg border bg-background p-1 group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <div className="flex items-center group-data-[collapsible=icon]:flex-col">
          <SidebarMenuButton asChild size="lg" tooltip="Edit profile" className="flex-1">
            <Link to="/profile">
              <Avatar className="shrink-0 rounded-md">
                {user.data.image ? (
                  <AvatarImage src={user.data.image} alt={`${user.data.name} avatar`} />
                ) : null}
                <AvatarFallback className="rounded-md">
                  {getInitials(user.data.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.data.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.data.email}</span>
              </span>
            </Link>
          </SidebarMenuButton>
          <Button
            aria-label={logoutMutation.isPending ? "Logging out" : "Logout"}
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            size="icon"
            title={logoutMutation.isPending ? "Logging out..." : "Logout"}
            type="button"
            variant="ghost"
            disabled={logoutMutation.isPending}
            onClick={handleLogout}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );

  return (
    <AppShell
      brand={{ name: "SupportOps", to: "/" }}
      footer={footer}
      fullBleed={fullBleed}
      fullWidth={fullWidth}
      headerRight={<HeaderControls />}
      navSections={shellNavSections}
    >
      {children}
    </AppShell>
  );
}
