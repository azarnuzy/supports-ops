import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
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
  SidebarMenuBadge,
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
  AlarmClockIcon,
  AtSignIcon,
  CameraIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  LogOutIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareHeartIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  MonitorIcon,
  PackageIcon,
  PhoneIcon,
  SendIcon,
  SettingsIcon,
  Share2Icon,
  StarIcon,
  TicketCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { meQueryOptions, useLogoutMutation } from "../auth";
import { getInitials } from "../../lib/utils";
import { HeaderControls } from "./components/header-controls";

const inboxShortcuts = [
  { icon: InboxIcon, label: "Inbox", count: 24, active: true },
  { icon: AtSignIcon, label: "Mentions", count: 3 },
  { icon: AlarmClockIcon, label: "Snoozed", count: 2 },
  { icon: SendIcon, label: "Sent" },
  { icon: MessagesSquareIcon, label: "All conversations" },
  { icon: UsersIcon, label: "Unassigned", count: 7 },
];

const channelShortcuts = [
  { icon: MailIcon, label: "Email", count: 18 },
  { icon: MessagesSquareIcon, label: "Chat", count: 5 },
  { icon: MessageCircleIcon, label: "WhatsApp", count: 1 },
  { icon: CameraIcon, label: "Instagram", count: 0 },
  { icon: Share2Icon, label: "Facebook", count: 0 },
  { icon: PhoneIcon, label: "Phone", count: 0 },
];

const viewShortcuts = [
  { icon: StarIcon, label: "VIP Customers", count: 8 },
  { icon: PackageIcon, label: "Orders & Returns", count: 6 },
  { icon: MessageSquareHeartIcon, label: "Product Feedback", count: 2 },
];

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

  const isChatPage = location.pathname.startsWith("/chat");

  const navItems =
    user.data.role === "ADMIN"
      ? [
          { icon: LayoutDashboardIcon, label: "Dashboard", to: "/" },
          { icon: MessageSquareIcon, label: "All tickets", to: "/chat" },
          { icon: LibraryBigIcon, label: "Knowledge", to: "/knowledge" },
          { icon: SettingsIcon, label: "Settings", to: "/settings/agents" },
        ]
      : [
          { icon: TicketCheckIcon, label: "Shared queue", to: "/tickets/queue" },
          { icon: UserRoundIcon, label: "My tickets", to: "/tickets/mine" },
        ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Platform">
                <Link to="/">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                    <MonitorIcon className="size-4" />
                  </span>
                  <span className="font-semibold group-data-[collapsible=icon]:hidden">
                    Platform
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.to}
                      tooltip={item.label}
                    >
                      <Link to={item.to}>
                        <item.icon className="size-4 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {isChatPage ? (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {inboxShortcuts.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          type="button"
                          isActive={item.active}
                          tooltip={item.label}
                        >
                          <item.icon className="size-4 shrink-0" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                        </SidebarMenuButton>
                        {item.count ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Channels</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {channelShortcuts.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton type="button" tooltip={item.label}>
                          <item.icon className="size-4 shrink-0" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                        </SidebarMenuButton>
                        {item.count ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Views</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {viewShortcuts.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton type="button" tooltip={item.label}>
                          <item.icon className="size-4 shrink-0" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                        </SidebarMenuButton>
                        {item.count ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          ) : null}
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
            className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
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
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Platform</span>
          </div>
          <HeaderControls />
        </header>
        <div
          className={
            fullBleed
              ? "flex min-h-0 w-full flex-1 flex-col"
              : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 lg:px-8"
          }
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
