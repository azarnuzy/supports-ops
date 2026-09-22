import { WrenchIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { formatLatency } from "../../ai-usage.utils";
import type { ToolTableProps } from "./index.types";

export default function ToolTable({ tools }: ToolTableProps) {
  const sorted = [...tools].sort((a, b) => b.calls - a.calls);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">By Tool</CardTitle>
        <CardDescription className="text-xs">
          How often each Tool was called, how often it failed, and how long it took.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Error rate</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
                <TableHead className="text-right">p95 latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((tool) => {
                const errorRate = tool.calls ? (tool.failed / tool.calls) * 100 : 0;
                return (
                  <TableRow key={tool.toolId}>
                    <TableCell className="max-w-56 truncate font-mono text-xs font-medium">
                      {tool.toolName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{tool.calls}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        tool.failed > 0 && "font-medium text-destructive",
                      )}
                    >
                      {errorRate.toFixed(errorRate > 0 && errorRate < 10 ? 1 : 0)}%
                      <span className="ml-1 text-xs text-muted-foreground">({tool.failed})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLatency(tool.avgLatencyMs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLatency(tool.p95LatencyMs)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
            <WrenchIcon className="size-4 shrink-0" />
            No Tool calls in this range.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
