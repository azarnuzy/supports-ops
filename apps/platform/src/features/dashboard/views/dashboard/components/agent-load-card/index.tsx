import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { AgentLoadCardProps } from "./index.types";

export default function AgentLoadCard({ loads }: AgentLoadCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Tickets per Human Agent</CardTitle>
        <CardDescription>Who is holding human-handled work right now.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loads.length ? (
          loads.map((load) => (
            <div key={load.humanAgentId} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{load.humanAgentName}</span>
              <span className="text-sm font-medium tabular-nums">{load.activeTicketCount}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No active human-handled Tickets.</p>
        )}
      </CardContent>
    </Card>
  );
}
