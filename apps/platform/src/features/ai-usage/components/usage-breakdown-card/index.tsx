import { InboxIcon } from "lucide-react";

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

import { formatCredits, formatTokens } from "../../ai-usage.utils";
import type { UsageBreakdownCardProps } from "./index.types";

export default function UsageBreakdownCard({ title, emptyLabel, rows }: UsageBreakdownCardProps) {
  const sorted = [...rows].sort((a, b) => b.creditsSpent - a.creditsSpent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">Credits spent in the selected range.</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{title}</TableHead>
                <TableHead className="text-right">AI Turns</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="truncate font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.turnCount}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatTokens(row.tokens)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCredits(row.creditsSpent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
            <InboxIcon className="size-4 shrink-0" />
            {emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
