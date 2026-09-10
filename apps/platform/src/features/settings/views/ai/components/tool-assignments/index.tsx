import { Badge } from "@repo/ui/components/badge";
import { Switch } from "@repo/ui/components/switch";
import type { ToolAssignmentsProps } from "./index.types";

const originLabel = { BUILT_IN: "Built-in", HTTP: "HTTP", MCP: "MCP" } as const;

export default function ToolAssignments({ tools, onToggle, isPending }: ToolAssignmentsProps) {
  const selectable = tools.filter(
    (tool) => tool.assigned || (tool.enabled && tool.availability === "AVAILABLE"),
  );

  if (selectable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No enabled Tools available to assign yet.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {selectable.map((tool) => (
        <div
          key={tool.id}
          className="flex items-center justify-between gap-4 border-b p-3 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{tool.name}</p>
              <Badge variant="outline">{originLabel[tool.origin]}</Badge>
              {tool.availability === "UNAVAILABLE" ? (
                <Badge variant="destructive">Unavailable</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{tool.description}</p>
          </div>
          <Switch
            aria-label={`Assign ${tool.name}`}
            checked={tool.assigned}
            disabled={isPending}
            onCheckedChange={(checked) => onToggle(tool.id, checked)}
          />
        </div>
      ))}
    </div>
  );
}
