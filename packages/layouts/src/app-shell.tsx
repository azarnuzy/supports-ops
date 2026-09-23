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
import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AppShellNavItem = {
  active: boolean;
  icon: LucideIcon;
  label: string;
  to: string;
};

export type AppShellNavSection = {
  collapsible?: boolean;
  items: AppShellNavItem[];
  label?: string;
};

export function AppShell({
  brand,
  children,
  footer,
  fullBleed = false,
  fullWidth = false,
  headerRight,
  navSections,
}: {
  brand: { name: string; to: string };
  children: ReactNode;
  footer?: ReactNode;
  fullBleed?: boolean;
  fullWidth?: boolean;
  headerRight?: ReactNode;
  navSections: AppShellNavSection[];
}) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="h-12 justify-center py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={brand.name}>
                <Link to={brand.to}>
                  <img src="/support-ops-logo.png" alt="" className="size-6 shrink-0" />
                  <span className="text-[13px] font-semibold group-data-[collapsible=icon]:hidden">
                    {brand.name}
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
                <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                  <Link to={item.to}>
                    <item.icon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
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
        {footer ? (
          <>
            <div className="px-2">
              <SidebarSeparator className="mx-0" />
            </div>
            <SidebarFooter>{footer}</SidebarFooter>
          </>
        ) : null}
        <SidebarRail />
      </Sidebar>
      <SidebarInset className={fullBleed ? undefined : "overflow-y-auto"}>
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
            <SidebarTrigger />
            <span className="text-[13px] font-medium text-muted-foreground">{brand.name}</span>
          </div>
          {headerRight}
        </header>
        <div
          className={
            fullBleed
              ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
              : cn(
                  "mx-auto flex min-w-0 w-full flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
                  fullWidth ? "max-w-none" : "max-w-6xl",
                )
          }
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
