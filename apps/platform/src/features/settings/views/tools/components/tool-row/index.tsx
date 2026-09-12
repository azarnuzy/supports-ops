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

const originLabel = { BUILT_IN: "System", HTTP: "Webhook", MCP: "MCP" } as const;

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function lastCallLabel(at: string) {
  const elapsed = Date.now() - new Date(at).getTime();
  for (const [unit, ms] of units) {
    if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
  }
  return "just now";
}

export default function ToolRow({
  tool,
  onToggleAttached,
  isToggling,
  onOpenDetail,
  onDelete,
}: ToolRowProps) {
  const disconnected = tool.availability !== "AVAILABLE";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-4 last:border-b-0">
      <button
        type="button"
        className="min-w-[12rem] flex-1 cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={onOpenDetail}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{tool.name}</p>
          <Badge variant="outline">{originLabel[tool.origin]}</Badge>
          <Badge variant={tool.risk === "MUTATING" ? "secondary" : "outline"}>
            {tool.risk === "MUTATING" ? "Requires approval" : "Read only"}
          </Badge>
          {disconnected ? <Badge variant="destructive">Disconnected</Badge> : null}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{tool.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tool.risk === "MUTATING"
            ? "Runs only when the customer asks for this action in their own message. "
            : null}
          {tool.lastCall
            ? `Last used ${lastCallLabel(tool.lastCall.at)} · ${tool.lastCall.succeeded ? "succeeded" : "failed"}`
            : "Never used yet"}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <Switch
          aria-label={`Enable ${tool.name} for the AI Agent`}
          checked={tool.assigned}
          disabled={isToggling || (disconnected && !tool.assigned)}
          onCheckedChange={onToggleAttached}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Actions for ${tool.name}`} size="icon-sm" variant="ghost">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpenDetail}>View details</DropdownMenuItem>
            {onDelete ? (
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
