import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/components/chart";
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
import { Link } from "@tanstack/react-router";
import { CoinsIcon, CreditCardIcon, UsersIcon, WalletIcon, ZapIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { api } from "../../../../lib/api";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
  ConsoleTablePagination,
} from "../../components/console-patterns";
import DateRangePicker, {
  trailingRange,
  type ConsoleDateRange,
} from "../../components/date-range-picker";
import { formatCount, formatIdr } from "../overview/overview.utils";

type Tab = "overview" | "payments" | "credits" | "unlimited";
type Direction = "asc" | "desc";
const limit = 20;
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const paymentLabels = { PAID: "Paid", PENDING: "Pending", EXPIRED: "Expired" } as const;
const creditLabels = { TOP_UP: "Top-Up", TRIAL_GRANT: "Trial Grant", SPEND: "Spend" } as const;
const periodLabels = { ACTIVE: "Active", ENDED: "Ended", ENDED_EARLY: "Ended early" } as const;

function Panel({
  title,
  action,
  children,
  centered = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <CardContent
        className={`min-w-0 px-4 pb-4 ${centered ? "flex flex-1 flex-col justify-center" : ""}`}
      >
        {children}
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  current,
  previous,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  current?: number;
  previous?: number;
  hint?: string;
}) {
  const change = previous ? Math.round((((current ?? 0) - previous) / previous) * 100) : null;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex min-h-28 items-start gap-3 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="break-words text-lg font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={`mt-2 text-xs ${change === null || change === 0 ? "text-muted-foreground" : change > 0 ? "text-emerald-500" : "text-destructive"}`}
          >
            {current === undefined
              ? hint
              : `${change === null ? (current ? "New" : "0%") : `${change > 0 ? "+" : ""}${change}%`} vs. previous period`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SortHead({
  label,
  column,
  sortBy,
  direction,
  onSort,
  right = false,
}: {
  label: string;
  column: string;
  sortBy: string;
  direction: Direction;
  onSort: (column: string) => void;
  right?: boolean;
}) {
  return (
    <TableHead className={right ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
        className="cursor-pointer whitespace-nowrap hover:text-foreground"
      >
        {label} {sortBy === column ? (direction === "desc" ? "↓" : "↑") : "↕"}
      </button>
    </TableHead>
  );
}

function Donut({
  rows,
  center,
  caption,
}: {
  rows: { label: string; value: number; color: string }[];
  center: string;
  caption: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let offset = 0;
  const stops = rows.map((row) => {
    const start = offset;
    offset += total ? (row.value / total) * 100 : 0;
    return `${row.color} ${start}% ${offset}%`;
  });
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        className="relative grid size-32 shrink-0 place-items-center rounded-full"
        style={{ background: total ? `conic-gradient(${stops.join(",")})` : "var(--muted)" }}
      >
        <div className="grid size-20 place-content-center rounded-full bg-card text-center">
          <strong className="text-lg">{center}</strong>
          <span className="text-[10px] text-muted-foreground">{caption}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3 text-xs">
            <span>
              <span
                className="mr-2 inline-block size-2 rounded-full"
                style={{ background: row.color }}
              />
              {row.label}
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {row.value} ({total ? Math.round((row.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PaymentsView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(23));
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [direction, setDirection] = useState<Direction>("desc");
  const bounds = { from: `${range.from}T00:00:00.000Z`, to: `${range.to}T23:59:59.999Z` };
  const common = {
    ...(workspace && { workspace }),
    page: String(page),
    limit: String(limit),
    sortDirection: direction,
  };
  const overview = useQuery({
    queryKey: ["operator", "billing", "overview", range],
    queryFn: async () => {
      const response = await api.operator.billing.overview.$get({ query: range });
      if (!response.ok) throw new Error("Failed to load billing overview.");
      return response.json();
    },
    enabled: tab === "overview",
  });
  const payments = useQuery({
    queryKey: [
      "operator",
      "billing",
      "payments",
      range,
      workspace,
      status,
      page,
      sortBy,
      direction,
    ],
    queryFn: async () => {
      const response = await api.operator.payments.$get({
        query: {
          ...common,
          ...bounds,
          ...(status !== "ALL" && { status: status as "PAID" | "PENDING" | "EXPIRED" }),
          sortBy: sortBy as "createdAt",
        },
      });
      if (!response.ok) throw new Error("Failed to load payments.");
      return response.json();
    },
    enabled: tab === "payments" || tab === "overview",
  });
  const credits = useQuery({
    queryKey: ["operator", "billing", "credits", range, workspace, status, page, sortBy, direction],
    queryFn: async () => {
      const response = await api.operator.billing.credits.$get({
        query: {
          ...common,
          ...bounds,
          ...(status !== "ALL" && { type: status as "TOP_UP" | "TRIAL_GRANT" | "SPEND" }),
          sortBy: sortBy as "createdAt",
        },
      });
      if (!response.ok) throw new Error("Failed to load credit operations.");
      return response.json();
    },
    enabled: tab === "credits" || tab === "overview",
  });
  const periods = useQuery({
    queryKey: ["operator", "billing", "periods", tab, workspace, status, page, sortBy, direction],
    queryFn: async () => {
      const response = await api.operator.billing["unlimited-periods"].$get({
        query: {
          ...common,
          ...(tab === "overview"
            ? { status: "ACTIVE" as const }
            : status !== "ALL"
              ? { status: status as "ACTIVE" | "ENDED" | "ENDED_EARLY" }
              : {}),
          sortBy: sortBy === "createdAt" ? "startAt" : (sortBy as "startAt"),
        },
      });
      if (!response.ok) throw new Error("Failed to load Unlimited Periods.");
      return response.json();
    },
    enabled: tab === "unlimited" || tab === "overview",
  });
  function selectTab(next: Tab) {
    setTab(next);
    setWorkspace("");
    setStatus("ALL");
    setPage(1);
    setSortBy(next === "unlimited" ? "startAt" : "createdAt");
    setDirection("desc");
  }
  function sort(column: string) {
    setDirection((old) => (sortBy === column && old === "desc" ? "asc" : "desc"));
    setSortBy(column);
    setPage(1);
  }
  const data = overview.data;
  const paymentRows = payments.data?.payments ?? [];
  const creditRows = credits.data?.operations ?? [];
  const periodRows = periods.data?.periods ?? [];
  const activeRows = periodRows.filter((row) => row.status === "ACTIVE");
  const activeQuery = tab === "payments" ? payments : tab === "credits" ? credits : periods;
  const total =
    tab === "payments"
      ? payments.data?.total
      : tab === "credits"
        ? credits.data?.total
        : periods.data?.total;
  return (
    <div className="space-y-4">
      <ConsolePageHeader
        title="Billing & Credits"
        description="Monitor revenue, payments, Credits, and Unlimited Periods across all Workspaces."
        actions={
          <DateRangePicker
            range={range}
            onChange={(value) => {
              setRange(value);
              setPage(1);
            }}
          />
        }
      />
      <nav
        aria-label="Billing sections"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border bg-card p-1"
      >
        {(
          [
            ["overview", "Overview"],
            ["payments", "Payments"],
            ["credits", "Credits"],
            ["unlimited", "Unlimited periods"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={tab === value ? "secondary" : "ghost"}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => selectTab(value)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === "overview" ? (
        overview.isPending || overview.isError || !data ? (
          <ConsoleQueryState
            isPending={overview.isPending}
            isError={overview.isError}
            error={overview.error}
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <Metric
                icon={<WalletIcon />}
                label="Revenue (IDR)"
                value={formatIdr(data.metrics.revenueIdr)}
                current={data.metrics.revenueIdr}
                previous={data.previous.revenueIdr}
              />
              <Metric
                icon={<CreditCardIcon />}
                label="Successful payments"
                value={formatCount(data.metrics.successfulPayments)}
                current={data.metrics.successfulPayments}
                previous={data.previous.successfulPayments}
              />
              <Metric
                icon={<CoinsIcon />}
                label="Credits added (Top-Up)"
                value={formatCount(data.metrics.creditsAdded)}
                current={data.metrics.creditsAdded}
                previous={data.previous.creditsAdded}
              />
              <Metric
                icon={<ZapIcon />}
                label="Credits consumed"
                value={formatCount(data.metrics.creditsConsumed)}
                current={data.metrics.creditsConsumed}
                previous={data.previous.creditsConsumed}
              />
              <Metric
                icon={<UsersIcon />}
                label="Active Unlimited Periods"
                value={formatCount(data.metrics.activeUnlimitedPeriods)}
                hint="Current, outside date filter"
              />
            </div>
            <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr]">
              <Panel title="Revenue and Credits over time">
                <ChartContainer
                  config={{
                    revenueIdr: { label: "Revenue (IDR)", color: "var(--chart-1)" },
                    added: { label: "Credits added", color: "var(--chart-2)" },
                    spent: { label: "Credits consumed", color: "var(--chart-3)" },
                  }}
                  className="h-44 w-full"
                >
                  <ComposedChart data={data.daily}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) => value.slice(5)}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="revenue"
                      width={45}
                      tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}m`}
                    />
                    <YAxis yAxisId="credits" orientation="right" width={35} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar yAxisId="revenue" dataKey="revenueIdr" fill="var(--chart-1)" />
                    <Line
                      yAxisId="credits"
                      type="monotone"
                      dataKey="added"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="credits"
                      type="monotone"
                      dataKey="spent"
                      stroke="var(--chart-3)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartContainer>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-[var(--chart-1)]">●</span> Revenue{" "}
                  <span className="ml-2 text-[var(--chart-2)]">●</span> Credits added{" "}
                  <span className="ml-2 text-[var(--chart-3)]">●</span> Credits consumed
                </p>
              </Panel>
              <Panel title="Credits balance distribution" centered>
                <Donut
                  center={formatCount(data.workspaceCount)}
                  caption="Workspaces"
                  rows={[
                    {
                      label: "> 1,000",
                      value: data.distribution.over1000,
                      color: "var(--chart-2)",
                    },
                    {
                      label: "100–1,000",
                      value: data.distribution.from100To1000,
                      color: "var(--chart-1)",
                    },
                    { label: "1–99", value: data.distribution.from1To100, color: "var(--chart-3)" },
                    {
                      label: "0 or less",
                      value: data.distribution.zeroOrLess,
                      color: "var(--destructive)",
                    },
                  ]}
                />
              </Panel>
              <Panel title="Quick actions" centered>
                <div className="space-y-2">
                  <Link
                    to="/workspaces"
                    className="block rounded-lg border p-3 text-sm hover:bg-muted"
                  >
                    <strong>Top up Credits →</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose a Workspace to add Credits.
                    </p>
                  </Link>
                  <Link
                    to="/workspaces"
                    className="block rounded-lg border p-3 text-sm hover:bg-muted"
                  >
                    <strong>Manage Unlimited Period →</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose a Workspace to grant or update.
                    </p>
                  </Link>
                </div>
              </Panel>
            </div>
            <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <Panel
                title="Recent payments"
                action={
                  <Button size="sm" variant="link" onClick={() => selectTab("payments")}>
                    View all →
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Workspace</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Credits added</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentRows.slice(0, 5).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {dateTime.format(new Date(row.paidAt ?? row.createdAt))}
                          </TableCell>
                          <TableCell>{row.workspace.name}</TableCell>
                          <TableCell className="text-right">{formatIdr(row.amountIdr)}</TableCell>
                          <TableCell>
                            <ConsoleStatusBadge
                              tone={
                                row.status === "PAID"
                                  ? "success"
                                  : row.status === "PENDING"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {paymentLabels[row.status]}
                            </ConsoleStatusBadge>
                          </TableCell>
                          <TableCell className="text-right">
                            {row.status === "PAID" ? formatCount(row.credits) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {payments.isPending ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading payments…</p>
                ) : paymentRows.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No payments in this range.</p>
                ) : null}
              </Panel>
              <Panel
                title="Unlimited periods"
                action={
                  <Button size="sm" variant="link" onClick={() => selectTab("unlimited")}>
                    View all →
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Ends at</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeRows.slice(0, 5).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.workspace.name}</TableCell>
                          <TableCell>
                            {row.endAt ? date.format(new Date(row.endAt)) : "No end date"}
                          </TableCell>
                          <TableCell>
                            <ConsoleStatusBadge tone="success">Active</ConsoleStatusBadge>
                          </TableCell>
                          <TableCell>{row.operator.name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {periods.isPending ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading periods…</p>
                ) : activeRows.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No active Unlimited Periods.</p>
                ) : null}
              </Panel>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <Panel title="Top Workspaces by Credits consumed" centered>
                <div className="space-y-2">
                  {data.topWorkspaces
                    .filter((row) => row.creditsConsumed > 0)
                    .map((row, index) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[auto_1fr_5rem] items-center gap-2 text-xs"
                      >
                        <span>{index + 1}</span>
                        <div>
                          <p className="truncate">{row.name}</p>
                          <div className="mt-1 h-2 rounded bg-muted">
                            <div
                              className="h-full rounded bg-primary"
                              style={{
                                width: `${data.topWorkspaces[0]?.creditsConsumed ? (row.creditsConsumed / data.topWorkspaces[0].creditsConsumed) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-right tabular-nums">
                          {formatCount(row.creditsConsumed)}
                        </span>
                      </div>
                    ))}
                  {data.topWorkspaces.every((row) => row.creditsConsumed === 0) ? (
                    <p className="text-xs text-muted-foreground">
                      No Credits consumed in this range.
                    </p>
                  ) : null}
                </div>
              </Panel>
              <Panel title="Payments by status" centered>
                <Donut
                  center={formatCount(
                    data.paymentStatuses.paid +
                      data.paymentStatuses.pending +
                      data.paymentStatuses.expired,
                  )}
                  caption="Payments created"
                  rows={Object.entries(paymentLabels).map(([key, label], index) => ({
                    label,
                    value:
                      key === "PAID"
                        ? data.paymentStatuses.paid
                        : key === "PENDING"
                          ? data.paymentStatuses.pending
                          : data.paymentStatuses.expired,
                    color: ["var(--chart-2)", "var(--chart-3)", "var(--muted-foreground)"][index],
                  }))}
                />
              </Panel>
              <Panel
                title="Recent credit operations"
                action={
                  <Button size="sm" variant="link" onClick={() => selectTab("credits")}>
                    View all →
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditRows.slice(0, 3).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{dateTime.format(new Date(row.createdAt))}</TableCell>
                          <TableCell>{row.workspace.name}</TableCell>
                          <TableCell>{creditLabels[row.type]}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.credits > 0 ? "+" : ""}
                            {formatCount(row.credits)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {credits.isPending ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading operations…</p>
                ) : creditRows.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No credit operations in this range.
                  </p>
                ) : null}
              </Panel>
            </div>
          </>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Filter by Workspace"
              placeholder="Search Workspace"
              value={workspace}
              onChange={(event) => {
                setWorkspace(event.target.value);
                setPage(1);
              }}
              className="w-56"
            />
            <NativeSelect
              aria-label="Filter by status or type"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="w-44"
            >
              <NativeSelectOption value="ALL">
                All {tab === "credits" ? "types" : "statuses"}
              </NativeSelectOption>
              {Object.entries(
                tab === "payments"
                  ? paymentLabels
                  : tab === "credits"
                    ? creditLabels
                    : periodLabels,
              ).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="text-xs text-muted-foreground">
              {tab === "unlimited"
                ? "All dates; active status is current."
                : "Date range above applies to this table."}
            </span>
          </div>
          <ConsoleDataTable
            footer={
              total && total > limit ? (
                <ConsoleTablePagination
                  page={page}
                  pageCount={Math.ceil(total / limit)}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          >
            <div className="overflow-x-auto">
              {activeQuery.isPending || activeQuery.isError ? (
                <ConsoleQueryState
                  isPending={activeQuery.isPending}
                  isError={activeQuery.isError}
                  error={activeQuery.error}
                  onRetry={() => void activeQuery.refetch()}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tab === "payments" ? (
                        <>
                          <SortHead
                            label="Workspace"
                            column="workspace"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Amount"
                            column="amountIdr"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                            right
                          />
                          <SortHead
                            label="Credits added"
                            column="credits"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                            right
                          />
                          <SortHead
                            label="Status"
                            column="status"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Created"
                            column="createdAt"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Paid"
                            column="paidAt"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <TableHead>Reference</TableHead>
                        </>
                      ) : tab === "credits" ? (
                        <>
                          <SortHead
                            label="Date"
                            column="createdAt"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Workspace"
                            column="workspace"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Type"
                            column="type"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Credits"
                            column="credits"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                            right
                          />
                          <TableHead>Note</TableHead>
                        </>
                      ) : (
                        <>
                          <SortHead
                            label="Workspace"
                            column="workspace"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Starts at"
                            column="startAt"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Ends at"
                            column="endAt"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Status"
                            column="status"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                          <SortHead
                            label="Added by"
                            column="operator"
                            sortBy={sortBy}
                            direction={direction}
                            onSort={sort}
                          />
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tab === "payments"
                      ? paymentRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <Link
                                to="/workspaces/$workspaceId"
                                params={{ workspaceId: row.workspace.id }}
                                className="text-primary hover:underline"
                              >
                                {row.workspace.name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right">{formatIdr(row.amountIdr)}</TableCell>
                            <TableCell className="text-right">
                              {row.status === "PAID" ? formatCount(row.credits) : "—"}
                            </TableCell>
                            <TableCell>
                              <ConsoleStatusBadge
                                tone={
                                  row.status === "PAID"
                                    ? "success"
                                    : row.status === "PENDING"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {paymentLabels[row.status]}
                              </ConsoleStatusBadge>
                            </TableCell>
                            <TableCell>{dateTime.format(new Date(row.createdAt))}</TableCell>
                            <TableCell>
                              {row.paidAt ? dateTime.format(new Date(row.paidAt)) : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.id}</TableCell>
                          </TableRow>
                        ))
                      : tab === "credits"
                        ? creditRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>{dateTime.format(new Date(row.createdAt))}</TableCell>
                              <TableCell>
                                <Link
                                  to="/workspaces/$workspaceId"
                                  params={{ workspaceId: row.workspace.id }}
                                  className="text-primary hover:underline"
                                >
                                  {row.workspace.name}
                                </Link>
                              </TableCell>
                              <TableCell>{creditLabels[row.type]}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.credits > 0 ? "+" : ""}
                                {formatCount(row.credits)}
                              </TableCell>
                              <TableCell>{row.note ?? "—"}</TableCell>
                            </TableRow>
                          ))
                        : periodRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>
                                <Link
                                  to="/workspaces/$workspaceId"
                                  params={{ workspaceId: row.workspace.id }}
                                  className="text-primary hover:underline"
                                >
                                  {row.workspace.name}
                                </Link>
                              </TableCell>
                              <TableCell>{dateTime.format(new Date(row.startAt))}</TableCell>
                              <TableCell>
                                {row.endAt ? dateTime.format(new Date(row.endAt)) : "No end date"}
                              </TableCell>
                              <TableCell>
                                <ConsoleStatusBadge
                                  tone={row.status === "ACTIVE" ? "success" : "neutral"}
                                >
                                  {periodLabels[row.status]}
                                </ConsoleStatusBadge>
                              </TableCell>
                              <TableCell>{row.operator.name}</TableCell>
                            </TableRow>
                          ))}
                    {(tab === "payments"
                      ? paymentRows.length
                      : tab === "credits"
                        ? creditRows.length
                        : periodRows.length) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No results match these filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </div>
          </ConsoleDataTable>
        </>
      )}
    </div>
  );
}
