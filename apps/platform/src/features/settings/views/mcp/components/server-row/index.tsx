import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Switch } from "@repo/ui/components/switch";
import { MoreHorizontalIcon, ServerIcon } from "lucide-react";
import type { ServerRowProps } from "./index.types";

export default function ServerRow({
  server,
  activeToolCount,
  onOpenDetail,
  onToggleServerEnabled,
  onDelete,
}: ServerRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
      <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className="min-w-[12rem] flex-1 cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={onOpenDetail}
      >
        <p className="truncate font-medium">{server.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{server.url}</p>
      </button>
      {activeToolCount === undefined ? null : (
        <Badge variant="outline">{activeToolCount} active tools</Badge>
      )}
      <Badge variant={server.enabled ? "outline" : "secondary"}>
        {server.enabled ? "Enabled" : "Disabled"}
      </Badge>
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
          <DropdownMenuItem onSelect={onOpenDetail}>View details</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
