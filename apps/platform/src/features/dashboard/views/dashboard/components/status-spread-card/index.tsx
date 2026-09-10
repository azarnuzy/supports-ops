import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { StatusBadge } from "@repo/ui/components/ticket-badge";
import type { StatusSpreadCardProps } from "./index.types";

export default function StatusSpreadCard({ counts }: StatusSpreadCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket statuses</CardTitle>
        <CardDescription>The current spread across the Workspace.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {counts.map((entry) => (
          <div key={entry.status} className="flex items-center justify-between gap-2">
            <StatusBadge status={entry.status} />
            <span className="text-sm font-medium tabular-nums">{entry.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
