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
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
  ConsoleTablePagination,
} from "../../components/console-patterns";

const statuses = ["PENDING", "PAID", "EXPIRED"] as const;
const ALL = "ALL";
const limit = 20;

const idrFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const statusLabel: Record<(typeof statuses)[number], string> = {
  PAID: "Paid",
  PENDING: "Pending",
  EXPIRED: "Expired",
};

const statusTone: Record<(typeof statuses)[number], "success" | "warning" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  EXPIRED: "neutral",
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
    <>
      <ConsolePageHeader
        title="Billing & Credits"
        description="Review Mayar Top-Up payments across Workspaces."
        actions={
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
                  {statusLabel[value]}
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
        }
      />
      <ConsoleDataTable
        footer={
          !query.isError && pageCount > 1 ? (
            <ConsoleTablePagination
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null
        }
      >
        {query.isPending || query.isError || payments.length === 0 ? (
          <ConsoleQueryState
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            errorFallback="Failed to load payments."
            isEmpty={!query.isPending && !query.isError && payments.length === 0}
            emptyTitle={
              status === ALL && !from && !to
                ? "No payments yet"
                : "No payments match these filters"
            }
            emptyDescription={
              status === ALL && !from && !to
                ? undefined
                : "Try changing the status or date range."
            }
            onRetry={() => void query.refetch()}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Amount</TableHead>
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
                  <TableCell className="text-right tabular-nums">
                    {idrFormat.format(payment.amountIdr)}
                  </TableCell>
                  <TableCell>
                    <ConsoleStatusBadge tone={statusTone[payment.status]}>
                      {statusLabel[payment.status]}
                    </ConsoleStatusBadge>
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
        )}
      </ConsoleDataTable>
    </>
  );
}
