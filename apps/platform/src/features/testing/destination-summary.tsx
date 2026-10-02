import { Link } from "@tanstack/react-router";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { useDestinationQuery } from "./hooks";

export function ObservabilityDestinationSummary() {
  const query = useDestinationQuery();
  const destination = query.data?.evalDestination;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Workspace Observability</h2>
          {destination && (
            <span className="text-xs text-muted-foreground">
              {destination.backend === "LENS" ? "Anvia Lens" : "Langfuse"}
            </span>
          )}
          <Badge variant={query.isError ? "destructive" : "outline"}>
            {query.isPending
              ? "Loading…"
              : query.isError
                ? "Unavailable"
                : destination
                  ? "Configured"
                  : "Not configured"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {destination
            ? "Testing uses the Observability destination configured for this Workspace."
            : "Configure Workspace Observability to review evaluations in Langfuse or Anvia Lens."}
        </p>
        {query.isError && (
          <Button
            size="sm"
            variant="link"
            className="justify-self-start px-0"
            onClick={() => void query.refetch()}
          >
            Retry loading destination
          </Button>
        )}
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link to="/workspace/observability">Configure Observability</Link>
      </Button>
    </div>
  );
}
