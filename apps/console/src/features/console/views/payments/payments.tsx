import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../../lib/api";

const statuses = ["PENDING", "PAID", "EXPIRED"] as const;
const ALL = "ALL";
const limit = 20;

const idrFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const statusVariant: Record<string, "default" | "outline" | "secondary"> = {
  PAID: "default",
  PENDING: "outline",
  EXPIRED: "secondary",
};

function toRangeBound(date: string, end: boolean) {
  return date
    ? new Date(`${date}T${end ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString()
    : undefined;
}

export default function PaymentsView() {
  const [status, setStatus] = useState<(typeof statuses)[number] | typeof ALL>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["operator", "payments", { status, from, to, page }],
    queryFn: async () => {
      const response = await api.operator.payments.$get({
        query: {
          ...(status !== ALL && { status }),
          ...(from && { from: toRangeBound(from, false) }),
          ...(to && { to: toRangeBound(to, true) }),
          page: String(page),
          limit: String(limit),
        },
      });
      if (!response.ok) throw new Error("Failed to load payments.");
      return response.json();
    },
  });

  const payments = query.data?.payments ?? [];
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / limit));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Mayar Top-Up Payments</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="Filter by status"
              className="w-40"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <NativeSelectOption value={ALL}>All statuses</NativeSelectOption>
              {statuses.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">Loading payments…</p>
          ) : query.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : "Failed to load payments."}
              </p>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          ) : payments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No payments match these filters.</p>
          ) : (
            <div className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Ledger entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <a
                          href={`/workspaces/${payment.workspace.id}`}
                          className="text-primary hover:underline"
                        >
                          {payment.workspace.name}
                        </a>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {idrFormat.format(payment.amountIdr)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[payment.status]}>{payment.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateFormat.format(new Date(payment.createdAt))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.paidAt ? dateFormat.format(new Date(payment.paidAt)) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {payment.ledgerEntryId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageCount > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {pageCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pageCount}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
