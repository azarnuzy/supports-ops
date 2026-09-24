import {
  fetchOperatorWorkspaces,
  type OperatorAttentionCondition,
  type OperatorWorkspace,
} from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  EllipsisIcon,
  LayoutGridIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
  ConsoleTablePagination,
} from "../../../console/components/console-patterns";
import DateRangePicker, { trailingRange } from "../../../console/components/date-range-picker";
import { ConsoleShell } from "../../../console/shell";
import {
  conditionLabel,
  conditionTone,
  operatorAtRiskQueryOptions,
} from "../../../console/views/at-risk/at-risk";
import { operatorOverviewQueryOptions } from "../../../console/views/overview/overview.services";
import { TopUpDialog } from "../detail/components/top-up-dialog";

const LIMIT = 8;
const conditions: OperatorAttentionCondition[] = [
  "CREDIT_EXHAUSTED",
  "LOW_BALANCE",
  "UNLIMITED_ENDING_SOON",
  "INACTIVE",
];
type SortBy =
  | "createdAt"
  | "name"
  | "userCount"
  | "balance"
  | "unlimitedEndAt"
  | "lastCustomerActivityAt"
  | "sessionCount"
  | "creditsUsed";
const sortOptions: { value: SortBy; label: string }[] = [
  { value: "lastCustomerActivityAt", label: "Last customer message" },
  { value: "createdAt", label: "Created" },
  { value: "name", label: "Workspace name" },
  { value: "userCount", label: "Users" },
  { value: "balance", label: "Balance" },
  { value: "unlimitedEndAt", label: "Unlimited Period" },
  { value: "sessionCount", label: "Sessions" },
  { value: "creditsUsed", label: "Credits used" },
];
const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const date = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");
const dateTime = (value: string | null) => (value ? dateTimeFormat.format(new Date(value)) : "—");

function Change({
  current,
  previous,
  goodWhenUp = true,
}: {
  current: number;
  previous: number;
  goodWhenUp?: boolean;
}) {
  if (!previous) return <span className="text-muted-foreground">{current ? "New" : "0%"}</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  if (!change) return <span className="text-muted-foreground">0%</span>;
  return (
    <span
      className={
        change > 0 === goodWhenUp
          ? "inline-flex items-center text-emerald-500"
          : "inline-flex items-center text-destructive"
      }
    >
      {change > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(change)}%
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
  change,
  tone = "bg-primary/10 text-primary",
}: {
  icon: ReactNode;
  label: string;
  value?: number;
  change?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex min-h-[102px] items-center gap-4 p-4">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-xl [&_svg]:size-6 ${tone}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {value === undefined ? "—" : numberFormat.format(value)}
          </p>
          {change ? (
            <p className="mt-1 text-xs">
              {change} <span className="text-muted-foreground">vs. previous period</span>
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceActions({
  workspace,
  onTopUp,
}: {
  workspace: { id: string; balance: number; conditions: OperatorAttentionCondition[] };
  onTopUp: (workspace: { id: string; balance: number }) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Workspace actions">
          <EllipsisIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }}>
            Detail
          </Link>
        </DropdownMenuItem>
        {workspace.conditions.includes("LOW_BALANCE") ||
        workspace.conditions.includes("CREDIT_EXHAUSTED") ? (
          <DropdownMenuItem onSelect={() => onTopUp(workspace)}>Top-Up</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function csvCell(value: string | number) {
  const raw = String(value);
  const safe = typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(rows: OperatorWorkspace[]) {
  const header = [
    "Workspace",
    "Slug",
    "Health",
    "Users",
    "Channels",
    "Balance (Credits)",
    "Unlimited Period ends",
    "Last customer message",
    "Sessions",
    "Credits used",
    "Admin",
    "Created",
  ];
  const data = rows.map((row) => [
    row.name,
    row.slug,
    row.conditions.map((condition) => conditionLabel[condition]).join("; ") || "Healthy",
    row.userCount,
    row.channels.join("; "),
    row.balance,
    row.activeUnlimitedPeriod?.endAt ?? "",
    row.lastCustomerActivityAt ?? "",
    row.sessionCount,
    row.creditsUsed,
    row.adminName ?? "",
    row.createdAt,
  ]);
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", [header, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "workspaces.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function WorkspacesListView() {
  const [range, setRange] = useState(() => trailingRange(7));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("lastCustomerActivityAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [attention, setAttention] = useState<OperatorAttentionCondition | "ALL">("ALL");
  const [status, setStatus] = useState<"ALL" | "HEALTHY" | "NEEDS_ATTENTION">("ALL");
  const [channel, setChannel] = useState<"ALL" | "WEB" | "WHATSAPP">("ALL");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [topUp, setTopUp] = useState<{ id: string; balance: number } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = {
    search: debouncedSearch || undefined,
    page,
    limit: LIMIT,
    sortBy,
    sortDirection,
    attention: attention === "ALL" ? undefined : attention,
    status: status === "ALL" ? undefined : status,
    channel: channel === "ALL" ? undefined : channel,
    ...range,
  };
  const workspaces = useQuery({
    queryKey: ["operator", "workspaces", params],
    queryFn: () => fetchOperatorWorkspaces(api, params),
    placeholderData: keepPreviousData,
  });
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const atRisk = useQuery(operatorAtRiskQueryOptions);
  const rows = workspaces.data?.workspaces ?? [];
  const total = workspaces.data?.total ?? 0;
  const filtered = Boolean(search || attention !== "ALL" || status !== "ALL" || channel !== "ALL");
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  function setSort(value: SortBy) {
    if (value === sortBy) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortBy(value);
      setSortDirection(value === "name" ? "asc" : "desc");
    }
    setPage(1);
  }
  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setAttention("ALL");
    setStatus("ALL");
    setChannel("ALL");
    setPage(1);
  }
  async function download() {
    setExporting(true);
    try {
      const all: OperatorWorkspace[] = [];
      for (let exportPage = 1; ; exportPage++) {
        const result = await fetchOperatorWorkspaces(api, {
          ...params,
          page: exportPage,
          limit: 100,
        });
        all.push(...result.workspaces);
        if (all.length >= result.total || result.workspaces.length === 0) break;
      }
      exportCsv(all);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export Workspaces.");
    } finally {
      setExporting(false);
    }
  }
  const heading = (label: string, key: SortBy) => (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:text-foreground"
      onClick={() => setSort(key)}
      aria-label={`Sort by ${label}${sortBy === key ? `, ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      {label}
      {sortBy === key ? (
        sortDirection === "asc" ? (
          <ArrowUpIcon className="size-3" />
        ) : (
          <ArrowDownIcon className="size-3" />
        )
      ) : (
        <ArrowUpDownIcon className="size-3" />
      )}
    </button>
  );
  const riskRows = [...(atRisk.data?.workspaces ?? [])]
    .sort(
      (a, b) =>
        conditions.findIndex((condition) => a.conditions.includes(condition)) -
          conditions.findIndex((condition) => b.conditions.includes(condition)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 4);
  const counts = workspaces.data?.channelCounts;
  const platformTotal = overview.data?.overview.workspaces.total ?? 0;

  return (
    <ConsoleShell>
      <div className="flex flex-col gap-4">
        <ConsolePageHeader
          title="Workspaces"
          description="Search, monitor, and manage customer Workspaces across SupportOps."
          actions={
            <>
              <DateRangePicker
                range={range}
                onChange={(next) => {
                  setRange(next);
                  setPage(1);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() =>
                  void Promise.all([workspaces.refetch(), overview.refetch(), atRisk.refetch()])
                }
              >
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </Button>
              {workspaces.dataUpdatedAt ? (
                <span className="text-xs text-muted-foreground">
                  Updated {dateTimeFormat.format(new Date(workspaces.dataUpdatedAt))}
                </span>
              ) : null}
            </>
          }
        />
        <section
          aria-label="Workspace summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Metric
            icon={<LayoutGridIcon />}
            label="Total Workspaces"
            value={overview.data?.overview.workspaces.total}
          />
          <Metric
            icon={<UsersIcon />}
            label="Active this period"
            tone="bg-emerald-500/10 text-emerald-500"
            value={overview.data?.overview.workspaces.active}
            change={
              overview.data ? (
                <Change
                  current={overview.data.overview.workspaces.active}
                  previous={overview.data.overview.previous.activeWorkspaces}
                />
              ) : undefined
            }
          />
          <Metric
            icon={<TriangleAlertIcon />}
            label="Need attention"
            tone="bg-orange-500/10 text-orange-500"
            value={atRisk.data?.workspaces.length}
          />
          <Metric
            icon={<PlusIcon />}
            label="New this period"
            value={overview.data?.overview.workspaces.new}
            change={
              overview.data ? (
                <Change
                  current={overview.data.overview.workspaces.new}
                  previous={overview.data.overview.previous.newWorkspaces}
                />
              ) : undefined
            }
          />
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-full sm:w-72"
            aria-label="Search Workspaces"
            placeholder="Search by Workspace name or slug..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              <SelectItem value="HEALTHY">Healthy</SelectItem>
              <SelectItem value="NEEDS_ATTENTION">Need attention</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={attention}
            onValueChange={(value) => {
              setAttention(value as typeof attention);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Attention filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All attention</SelectItem>
              {conditions.map((value) => (
                <SelectItem key={value} value={value}>
                  {conditionLabel[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={channel}
            onValueChange={(value) => {
              setChannel(value as typeof channel);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Channel filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All channels</SelectItem>
              <SelectItem value="WEB">Web Widget</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSort(value as SortBy)}>
            <SelectTrigger aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {filtered ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void download()} disabled={exporting}>
              <DownloadIcon className="mr-1 size-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </div>
        <ConsoleDataTable
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {total ? (page - 1) * LIMIT + 1 : 0}–{Math.min(page * LIMIT, total)} of{" "}
                {numberFormat.format(total)} Workspaces
              </p>
              <ConsoleTablePagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          }
        >
          <div className="border-b px-4 py-3 text-sm font-semibold">
            Workspaces ({numberFormat.format(total)})
          </div>
          {workspaces.isPending || workspaces.isError || rows.length === 0 ? (
            <div className="min-h-60">
              <ConsoleQueryState
                isPending={workspaces.isPending}
                isError={workspaces.isError}
                error={workspaces.error}
                isEmpty={!workspaces.isPending && !workspaces.isError && rows.length === 0}
                emptyTitle={filtered ? "No Workspaces match these filters" : "No Workspaces yet"}
                onRetry={() => void workspaces.refetch()}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1600px] table-fixed text-xs [&_td]:break-words [&_td]:whitespace-normal">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[16%]">{heading("Workspace", "name")}</TableHead>
                    <TableHead className="w-[12%]">Health</TableHead>
                    <TableHead className="text-right">{heading("Users", "userCount")}</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead className="text-right">{heading("Balance", "balance")}</TableHead>
                    <TableHead>{heading("Unlimited Period", "unlimitedEndAt")}</TableHead>
                    <TableHead className="w-[12%]">
                      {heading("Last customer message", "lastCustomerActivityAt")}
                    </TableHead>
                    <TableHead className="text-right">
                      {heading("Sessions", "sessionCount")}
                    </TableHead>
                    <TableHead className="text-right">
                      {heading("Credits used", "creditsUsed")}
                    </TableHead>
                    <TableHead className="w-[11%]">{heading("Created", "createdAt")}</TableHead>
                    <TableHead className="w-12 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          to="/workspaces/$workspaceId"
                          params={{ workspaceId: row.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="text-muted-foreground">{row.slug}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-wrap gap-1 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:whitespace-normal">
                          {row.conditions.length ? (
                            row.conditions.map((condition) => (
                              <ConsoleStatusBadge key={condition} tone={conditionTone[condition]}>
                                {conditionLabel[condition]}
                              </ConsoleStatusBadge>
                            ))
                          ) : (
                            <ConsoleStatusBadge tone="success">Healthy</ConsoleStatusBadge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFormat.format(row.userCount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {row.channels.includes("WEB") ? (
                            <span
                              title="Web Widget ready"
                              className="rounded bg-primary/10 px-1.5 py-1 text-primary"
                            >
                              Web
                            </span>
                          ) : null}
                          {row.channels.includes("WHATSAPP") ? (
                            <span
                              title="WhatsApp connected"
                              className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-500"
                            >
                              WA
                            </span>
                          ) : null}
                          {row.channels.length === 0 ? "—" : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFormat.format(row.balance)}
                      </TableCell>
                      <TableCell>
                        {row.activeUnlimitedPeriod
                          ? row.activeUnlimitedPeriod.endAt
                            ? date(row.activeUnlimitedPeriod.endAt)
                            : "Unlimited"
                          : "—"}
                      </TableCell>
                      <TableCell>{dateTime(row.lastCustomerActivityAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFormat.format(row.sessionCount)}{" "}
                        <Change current={row.sessionCount} previous={row.previousSessionCount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFormat.format(row.creditsUsed)}{" "}
                        <Change
                          current={row.creditsUsed}
                          previous={row.previousCreditsUsed}
                          goodWhenUp={false}
                        />
                      </TableCell>
                      <TableCell>{dateTime(row.createdAt)}</TableCell>
                      <TableCell className="text-center">
                        <WorkspaceActions workspace={row} onTopUp={setTopUp} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ConsoleDataTable>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Top at-risk Workspaces</h2>
                  <p className="text-xs text-muted-foreground">Workspaces needing attention now</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/needs-attention">View all →</Link>
                </Button>
              </div>
              {atRisk.isPending || atRisk.isError ? (
                <ConsoleQueryState
                  isPending={atRisk.isPending}
                  isError={atRisk.isError}
                  error={atRisk.error}
                  onRetry={() => void atRisk.refetch()}
                />
              ) : riskRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Workspace</th>
                        <th className="px-2 py-2 font-medium">Issue</th>
                        <th className="px-2 py-2 text-right font-medium">Balance</th>
                        <th className="px-2 py-2 font-medium">Last customer message</th>
                        <th className="px-4 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {riskRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2">
                            <Link
                              to="/workspaces/$workspaceId"
                              params={{ workspaceId: row.id }}
                              className="text-primary hover:underline"
                            >
                              {row.name}
                            </Link>
                          </td>
                          <td className="px-2 py-2">
                            {row.conditions
                              .map((condition) => conditionLabel[condition])
                              .join(", ")}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {numberFormat.format(row.balance)}
                          </td>
                          <td className="px-2 py-2">{dateTime(row.lastCustomerActivityAt)}</td>
                          <td className="px-4 py-2 text-center">
                            <WorkspaceActions workspace={row} onTopUp={setTopUp} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-xs text-muted-foreground">No Workspaces need attention.</p>
              )}
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold">Workspaces by Channel</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ready Channels; Web Widget readiness does not confirm site installation.
              </p>
              {(
                [
                  ["WEB", "Web Widget"],
                  ["WHATSAPP", "WhatsApp"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="mt-5 grid grid-cols-[6rem_minmax(0,1fr)_2rem_3rem] items-center gap-2 text-xs"
                >
                  <span>{label}</span>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className={
                        key === "WEB"
                          ? "h-full rounded bg-primary"
                          : "h-full rounded bg-emerald-500"
                      }
                      style={{
                        width: `${platformTotal ? ((counts?.[key] ?? 0) / platformTotal) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-right tabular-nums">{counts?.[key] ?? "—"}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {platformTotal ? Math.round(((counts?.[key] ?? 0) / platformTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        {topUp ? (
          <TopUpDialog
            workspaceId={topUp.id}
            balance={topUp.balance}
            open
            onOpenChange={(open) => {
              if (!open) setTopUp(null);
            }}
          />
        ) : null}
      </div>
    </ConsoleShell>
  );
}
