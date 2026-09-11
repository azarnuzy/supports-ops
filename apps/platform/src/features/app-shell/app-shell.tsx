import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@repo/ui/components/sidebar";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BotIcon,
  ChevronRightIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  LibraryBigIcon,
  LogOutIcon,
  MessageSquareCodeIcon,
  MonitorIcon,
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

function NavMenuButton({ active, item }: { active: boolean; item: NavItem }) {
  return (
    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
      <Link to={item.to}>
        <item.icon className="size-4 shrink-0" />
        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function PlatformAppShell({
  children,
  fullBleed = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
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
              { icon: LibraryBigIcon, label: "Knowledge", to: "/knowledge" },
            ],
            label: "Configure",
          },
          {
            items: [{ icon: MessageSquareCodeIcon, label: "Channels", to: "/widget" }],
            label: "Deploy",
          },
          {
            items: [
              { icon: UsersRoundIcon, label: "Users", to: "/workspace/users" },
              { icon: TagsIcon, label: "Ticket categories", to: "/workspace/categories" },
            ],
            label: "Workspace",
          },
        ]
      : [{ collapsible: true, items: conversationItems, label: "Conversations" }];

  const activeTo = activeNavItemTo(
    location.pathname,
    navSections.flatMap((section) => section.items),
  );

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Platform">
                <Link to="/">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                    <MonitorIcon className="size-3.5" />
                  </span>
                  <span className="text-[13px] font-semibold group-data-[collapsible=icon]:hidden">
                    Platform
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {navSections.map((section) => {
            const items = section.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <NavMenuButton active={item.to === activeTo} item={item} />
              </SidebarMenuItem>
            ));
            return (
              <SidebarGroup key={section.label ?? section.items[0]?.to}>
                {section.collapsible ? (
                  <Collapsible className="group/collapsible" defaultOpen>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="w-full">
                        {section.label}
                        <ChevronRightIcon className="ml-auto size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <div className="ml-3.5 border-l pl-2 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:pl-0">
                          <SidebarMenu>{items}</SidebarMenu>
                        </div>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <>
                    {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
                    <SidebarGroupContent>
                      <SidebarMenu>{items}</SidebarMenu>
                    </SidebarGroupContent>
                  </>
                )}
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Edit profile">
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
                    <span className="truncate text-xs text-muted-foreground">
                      {user.data.email}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Button
            className="h-8 w-full justify-start text-[13px] text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:text-foreground"
            size="sm"
            type="button"
            variant="ghost"
            disabled={logoutMutation.isPending}
            onClick={handleLogout}
          >
            <LogOutIcon className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </span>
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className={fullBleed ? undefined : "overflow-y-auto"}>
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
            <SidebarTrigger />
            <span className="text-[13px] font-medium text-muted-foreground">Platform</span>
          </div>
          <HeaderControls />
        </header>
        <div
          className={
            fullBleed
              ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
              : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 lg:px-8"
          }
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
