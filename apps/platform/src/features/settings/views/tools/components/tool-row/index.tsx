import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Switch } from "@repo/ui/components/switch";
import { MoreHorizontalIcon } from "lucide-react";
import type { ToolRowProps } from "./index.types";

const originLabel = { BUILT_IN: "Built-in", HTTP: "HTTP", MCP: "MCP" } as const;

export default function ToolRow({ tool, onToggleEnabled, onEdit, onDelete }: ToolRowProps) {
  return (
    <div className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{tool.name}</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">{tool.description}</p>
      </div>
      <Badge variant="outline">{originLabel[tool.origin]}</Badge>
      <Badge variant={tool.risk === "MUTATING" ? "destructive" : "secondary"}>
        {tool.risk === "MUTATING" ? "Mutating" : "Read-only"}
      </Badge>
      <Badge variant={tool.availability === "AVAILABLE" ? "outline" : "destructive"}>
        {tool.availability === "AVAILABLE" ? "Available" : "Unavailable"}
      </Badge>
      <Badge variant={tool.assigned ? "default" : "outline"}>
        {tool.assigned ? "Assigned" : "Unassigned"}
      </Badge>
      <div className="flex items-center gap-2">
        <Switch
          aria-label={`Enable ${tool.name}`}
          checked={tool.enabled}
          onCheckedChange={onToggleEnabled}
        />
        {onEdit || onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={`Actions for ${tool.name}`} size="icon-sm" variant="ghost">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit ? <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem> : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
