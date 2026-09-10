import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Switch } from "@repo/ui/components/switch";
import type { DiscoveredToolRowProps } from "./index.types";

const statusVariant = {
  CHANGED: "destructive",
  CURRENT: "outline",
  UNAVAILABLE: "destructive",
} as const;

const statusLabel = {
  CHANGED: "Changed — needs review",
  CURRENT: "Current",
  UNAVAILABLE: "Unavailable",
} as const;

export default function DiscoveredToolRow({
  tool,
  onToggleEnabled,
  onReview,
}: DiscoveredToolRowProps) {
  const needsReview = tool.discoveryStatus !== "UNAVAILABLE" && !tool.tool.enabled;

  return (
    <div className="grid gap-3 border-t p-3 pl-6 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{tool.remoteName}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {tool.discoveredDescription}
        </p>
      </div>
      <Badge variant={statusVariant[tool.discoveryStatus]}>
        {statusLabel[tool.discoveryStatus]}
      </Badge>
      <Badge variant={tool.tool.risk === "MUTATING" ? "destructive" : "secondary"}>
        {tool.tool.risk === "MUTATING" ? "Mutating" : "Read-only"}
      </Badge>
      <div className="flex items-center gap-2">
        {needsReview || tool.discoveryStatus === "CHANGED" ? (
          <Button size="sm" variant="outline" onClick={onReview}>
            Review
          </Button>
        ) : (
          <Switch
            aria-label={`Enable ${tool.remoteName}`}
            checked={tool.tool.enabled}
            onCheckedChange={onToggleEnabled}
            disabled={tool.discoveryStatus === "UNAVAILABLE"}
          />
        )}
      </div>
    </div>
  );
}
