import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Switch } from "@repo/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { RefreshCwIcon } from "lucide-react";
import DiscoveredToolRow from "../discovered-tool-row";
import type { ServerSheetProps } from "./index.types";

export default function ServerSheet({
  open,
  onOpenChange,
  server,
  tools,
  lastTest,
  isTesting,
  isDiscovering,
  onTest,
  onDiscover,
  onToggleServerEnabled,
  onEdit,
  onDelete,
  onToggleToolEnabled,
  onReviewTool,
}: ServerSheetProps) {
  if (!server) return null;

  const activeCount = tools?.filter((tool) => tool.tool.enabled).length ?? 0;
  const needsReview =
    tools?.filter((tool) => tool.discoveryStatus === "CHANGED" || !tool.tool.enabled).length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle>{server.name}</SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">{server.url}</SheetDescription>
        </SheetHeader>

        <div className="p-5">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tools">Tools{tools ? ` (${tools.length})` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 grid gap-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Server enabled</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    While this is off, none of its tools can be called, however they are configured.
                  </p>
                </div>
                <Switch
                  aria-label={`Enable ${server.name}`}
                  checked={server.enabled}
                  onCheckedChange={onToggleServerEnabled}
                />
              </div>

              <div className="grid gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Connection</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                      {lastTest
                        ? lastTest.ok
                          ? "The last test reached the server."
                          : (lastTest.message ?? "The last test failed.")
                        : "Not tested in this session."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={isTesting} onClick={onTest}>
                      {isTesting ? "Testing…" : "Test connection"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isDiscovering}
                      onClick={onDiscover}
                    >
                      <RefreshCwIcon className="size-3.5" />
                      {isDiscovering ? "Discovering…" : "Discover tools"}
                    </Button>
                  </div>
                </div>
                {tools ? (
                  <p className="text-[13px] text-muted-foreground">
                    {tools.length} tools discovered · {activeCount} active
                    {needsReview ? ` · ${needsReview} waiting for approval` : ""}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onEdit}>
                  Edit server
                </Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
                  Delete server
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="mt-4">
              {!tools ? (
                <div className="grid place-items-center gap-3 rounded-lg border border-dashed p-10 text-center">
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Run a discovery to see what this server exposes. Nothing it offers can be called
                    until you approve it here.
                  </p>
                  <Button size="sm" disabled={isDiscovering} onClick={onDiscover}>
                    <RefreshCwIcon className="size-3.5" />
                    {isDiscovering ? "Discovering…" : "Discover tools"}
                  </Button>
                </div>
              ) : null}
              {tools?.length === 0 ? (
                <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                  This server exposes no tools.
                </p>
              ) : null}
              {tools?.length ? (
                <div className="overflow-hidden rounded-lg border">
                  {tools.map((tool) => (
                    <DiscoveredToolRow
                      key={tool.toolId}
                      tool={tool}
                      onToggleEnabled={(enabled) => onToggleToolEnabled(tool.toolId, enabled)}
                      onReview={() => onReviewTool(tool)}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
