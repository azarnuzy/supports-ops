import { ReceiptTextIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@repo/ui/components/badge";
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
import ResourcePagination from "../../../settings/components/resource-pagination";
import {
  channelLabels,
  formatLedgerTimestamp,
  formatSignedCredits,
  formatTokens,
  ledgerEntryTypeLabels,
} from "../../ai-usage.utils";
import { creditLedgerPageSize } from "../../ai-usage.hooks";
import type { LedgerTableProps } from "./index.types";

export default function LedgerTable({ query }: LedgerTableProps) {
  const [page, setPage] = useState(1);
  const pages = query.data?.pages ?? [];
  const entries = pages[page - 1]?.entries ?? [];
  const pageCount = Math.max(1, Math.ceil((pages[0]?.total ?? 0) / creditLedgerPageSize));

  // Pages are cursor-based, so the next one is fetched only when first visited.
  const goToPage = async (next: number) => {
    if (next > pages.length) await query.fetchNextPage();
    setPage(next);
  };

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
                  <TableHead className="text-right">Tokens</TableHead>
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
                      {entry.note ??
                        ([entry.agentModel, entry.channel ? channelLabels[entry.channel] : null]
                          .filter(Boolean)
                          .join(" · ") ||
                          "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatLedgerTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {entry.inputTokens === null
                        ? "—"
                        : formatTokens(entry.inputTokens + (entry.outputTokens ?? 0))}
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
            <ResourcePagination
              page={page}
              pageCount={pageCount}
              onPageChange={(next) => void goToPage(next)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
