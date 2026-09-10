import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Switch } from "@repo/ui/components/switch";
import { MoreHorizontalIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import DiscoveredToolRow from "../discovered-tool-row";
import type { ServerRowProps } from "./index.types";

export default function ServerRow({
  server,
  tools,
  isTesting,
  isDiscovering,
  onTest,
  onDiscover,
  onToggleServerEnabled,
  onEdit,
  onDelete,
  onToggleToolEnabled,
  onReviewTool,
}: ServerRowProps) {
  return (
    <div className="border-b last:border-b-0">
      <div className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:items-center">
        <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium">{server.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{server.url}</p>
        </div>
        <Badge variant={server.enabled ? "outline" : "secondary"}>
          {server.enabled ? "Enabled" : "Disabled"}
        </Badge>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={isTesting} onClick={onTest}>
            {isTesting ? "Testing…" : "Test Connection"}
          </Button>
          <Button size="sm" variant="outline" disabled={isDiscovering} onClick={onDiscover}>
            <RefreshCwIcon className="size-3.5" />
            {isDiscovering ? "Discovering…" : "Discover Tools"}
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Switch
            aria-label={`Enable ${server.name}`}
            checked={server.enabled}
            onCheckedChange={onToggleServerEnabled}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={`Actions for ${server.name}`} size="icon-sm" variant="ghost">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {tools && tools.length > 0 ? (
        <div>
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
      {tools && tools.length === 0 ? (
        <p className="border-t p-3 pl-6 text-xs text-muted-foreground">No Tools discovered yet.</p>
      ) : null}
    </div>
  );
}
