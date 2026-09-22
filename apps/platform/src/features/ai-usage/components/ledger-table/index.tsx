import { ReceiptTextIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
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

import ResourceListState from "../../../settings/components/resource-list-state";
import {
  formatLedgerTimestamp,
  formatSignedCredits,
  ledgerEntryTypeLabels,
} from "../../ai-usage.utils";
import type { LedgerTableProps } from "./index.types";

export default function LedgerTable({ query }: LedgerTableProps) {
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Credit Ledger</CardTitle>
        <CardDescription className="text-xs">
          Every Trial Grant, Top-Up, and spend this Workspace has ever recorded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResourceListState
          isPending={query.isPending}
          isError={query.isError}
          errorLabel={
            query.error instanceof Error ? query.error.message : "Failed to load the Credit Ledger."
          }
          onRetry={() => query.refetch()}
          isEmpty={entries.length === 0}
          emptyIcon={<ReceiptTextIcon className="size-5 text-muted-foreground" />}
          emptyTitle="No Credit Ledger entries yet"
          emptyDescription="Trial Grant, Top-Ups, and Credit spend will show up here once your AI Agent has replied."
        />
        {entries.length > 0 ? (
          <div className="grid gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant={entry.type === "SPEND" ? "secondary" : "outline"}>
                        {ledgerEntryTypeLabels[entry.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.note ?? (entry.agentModel ? entry.agentModel : "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatLedgerTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell
                      className={
                        entry.credits < 0
                          ? "text-right font-semibold tabular-nums text-destructive"
                          : "text-right font-semibold tabular-nums text-primary"
                      }
                    >
                      {formatSignedCredits(entry.credits)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {query.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
