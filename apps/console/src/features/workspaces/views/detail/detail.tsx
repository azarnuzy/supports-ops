import {
  endUnlimitedPeriodEarly,
  extendUnlimitedPeriod,
  fetchOperatorActions,
  fetchOperatorWorkspaceDetail,
  grantUnlimitedPeriod,
  type OperatorAction,
  type UnlimitedPeriod,
} from "@repo/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Calendar } from "@repo/ui/components/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/components/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Switch } from "@repo/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CoinsIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
} from "../../../console/components/console-patterns";
import DateRangePicker, {
  trailingRange,
  type ConsoleDateRange,
} from "../../../console/components/date-range-picker";
import { conditionLabel } from "../../../console/views/at-risk/at-risk";
import { ConsoleShell } from "../../../console/shell";
import { api } from "../../../../lib/api";
import { TopUpDialog } from "./components/top-up-dialog";

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const outcomeLabels: Record<string, string> = {
  HUMAN_RESOLVED: "Human resolved",
  CUSTOMER_CONFIRMED: "Customer confirmed",
  CUSTOMER_INACTIVE: "Customer inactive (AI)",
  CUSTOMER_INACTIVE_HUMAN_HANDLING: "Customer inactive (human)",
  CUSTOMER_INACTIVE_SHARED_QUEUE: "Customer inactive (queue)",
};
const actionLabels: Record<OperatorAction["type"], string> = {
  TOP_UP: "Manual Top-Up",
  UNLIMITED_PERIOD_GRANTED: "Unlimited Period granted",
  UNLIMITED_PERIOD_EXTENDED: "Unlimited Period extended",
  UNLIMITED_PERIOD_ENDED: "Unlimited Period ended",
};
function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}
function formatDateTime(value: string | null) {
  return value ? dateTimeFormat.format(new Date(value)) : "Never";
}
function Change({
  current,
  previous,
  goodWhenUp = true,
}: {
  current: number;
  previous: number;
  goodWhenUp?: boolean;
}) {
  if (previous === 0)
    return (
      <span className="text-muted-foreground">{current ? "New" : "0%"} vs. previous period</span>
    );
  const change = Math.round(((current - previous) / previous) * 100);
  return (
    <span
      className={
        change && change > 0 === goodWhenUp
          ? "text-emerald-500"
          : change
            ? "text-destructive"
            : "text-muted-foreground"
      }
    >
      {change > 0 ? "+" : ""}
      {change}% vs. previous period
    </span>
  );
}
function Metric({
  icon,
  label,
  value,
  hint,
  change,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  change?: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-lg leading-tight font-semibold" title={value}>
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          {change && <p className="mt-1 text-xs">{change}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
function Panel({
  title,
  children,
  action,
  contentClassName = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={`p-4 ${contentClassName}`}>{children}</CardContent>
    </Card>
  );
}
function SortButton({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: string;
  sort: { column: string; descending: boolean };
  onSort: (column: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}${sort.column === column ? (sort.descending ? ", descending" : ", ascending") : ""}`}
      className="cursor-pointer hover:text-foreground"
    >
      {label} {sort.column === column ? (sort.descending ? "↓" : "↑") : "↕"}
    </button>
  );
}
export default function WorkspaceDetailView({ workspaceId }: { workspaceId: string }) {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [unlimitedOpen, setUnlimitedOpen] = useState(false);
  const [sort, setSort] = useState({ column: "count", descending: true });
  const changeSort = (column: string) =>
    setSort((old) => ({
      column,
      descending: old.column === column ? !old.descending : column === "count",
    }));
  const detail = useQuery({
    queryKey: ["operator", "workspace", workspaceId, range.from, range.to],
    queryFn: () => fetchOperatorWorkspaceDetail(api, workspaceId, range),
  });
  const actions = useQuery({
    queryKey: ["operator", "actions", workspaceId],
    queryFn: () => fetchOperatorActions(api, { workspaceId }),
  });
  const data = detail.data;
  const outcomes = [...(data?.outcomes ?? [])].sort((a, b) =>
    sort.column === "reason"
      ? a.reason.localeCompare(b.reason) * (sort.descending ? -1 : 1)
      : (a.count - b.count) * (sort.descending ? -1 : 1),
  );
  const outcomeTotal = outcomes.reduce((sum, row) => sum + row.count, 0);
  const trend =
    data?.sessions.daily.map((row, index) => ({
      ...row,
      credits: data.aiUsage.summary.daily[index]?.creditsSpent ?? 0,
    })) ?? [];
  return (
    <ConsoleShell>
      <div className="space-y-4">
        {detail.isPending || detail.isError || !data ? (
          <ConsoleQueryState
            isPending={detail.isPending}
            isError={detail.isError}
            error={detail.error}
            isEmpty={!detail.isPending && !detail.isError && data === null}
            emptyTitle="Workspace not found"
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/workspaces" aria-label="Back to Workspaces">
                  <ArrowLeftIcon className="size-4" />
                </Link>
              </Button>
              <div className="min-w-0 flex-1">
                <ConsolePageHeader
                  title={data.workspace.name}
                  description={`${data.workspace.slug} · Created ${formatDate(data.workspace.createdAt)}`}
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <DateRangePicker range={range} onChange={setRange} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void Promise.all([detail.refetch(), actions.refetch()])}
                      >
                        <RefreshCwIcon className="mr-1 size-3.5" />
                        Refresh
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Updated {formatDateTime(new Date(detail.dataUpdatedAt).toISOString())}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm">Manage credits</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setTopUpOpen(true)}>
                            Top up credits
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setUnlimitedOpen(true)}>
                            {isActive(data.unlimitedPeriod)
                              ? "Update unlimited period"
                              : "Grant unlimited period"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  }
                />
              </div>
            </div>
            <TopUpDialog
              workspaceId={workspaceId}
              balance={data.aiUsage.summary.balance}
              open={topUpOpen}
              onOpenChange={setTopUpOpen}
            />
            <UnlimitedPeriodDialog
              workspaceId={workspaceId}
              unlimitedPeriod={data.unlimitedPeriod}
              open={unlimitedOpen}
              onOpenChange={setUnlimitedOpen}
            />
            <section
              aria-label="Workspace summary"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
            >
              <Metric
                icon={<TriangleAlertIcon />}
                label="Health status"
                value={data.attention.conditions.length ? "Needs attention" : "Healthy"}
                hint={
                  data.attention.conditions.map((c) => conditionLabel[c]).join(", ") ||
                  "No current issues"
                }
              />
              <Metric
                icon={<CoinsIcon />}
                label="Balance"
                value={`${numberFormat.format(data.aiUsage.summary.balance)} credits`}
                hint={data.attention.conditions.includes("LOW_BALANCE") ? "Low balance" : undefined}
              />
              <Metric
                icon={<MessageSquareIcon />}
                label="Sessions"
                value={numberFormat.format(data.sessions.count)}
                change={
                  <Change current={data.sessions.count} previous={data.sessions.previousCount} />
                }
              />
              <Metric
                icon={<ActivityIcon />}
                label="Credits used"
                value={numberFormat.format(data.aiUsage.summary.totals.creditsSpent)}
                change={
                  <Change
                    current={data.aiUsage.summary.totals.creditsSpent}
                    previous={data.aiUsage.summary.previousTotals.creditsSpent}
                    goodWhenUp={false}
                  />
                }
              />
              <Metric
                icon={<MessageSquareIcon />}
                label="Last customer message"
                value={
                  data.attention.lastCustomerActivityAt
                    ? formatDate(data.attention.lastCustomerActivityAt)
                    : "Never"
                }
                hint={
                  data.attention.lastCustomerActivityAt
                    ? `${timeFormat.format(new Date(data.attention.lastCustomerActivityAt))} · ${Math.floor((Date.now() - new Date(data.attention.lastCustomerActivityAt).getTime()) / 86400000)} days ago`
                    : "No messages yet"
                }
              />
            </section>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,1fr)]">
              <div className="min-w-0 space-y-4">
                <Panel
                  title="Workspace overview"
                  action={<span className="text-xs text-muted-foreground">Selected period</span>}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Sessions and Credits used per day</span>
                    <span>
                      <span className="text-primary">●</span> Sessions{" "}
                      <span className="ml-2 text-[var(--chart-2)]">●</span> Credits used
                    </span>
                  </div>
                  <ChartContainer
                    config={{
                      count: { label: "Sessions", color: "var(--primary)" },
                      credits: { label: "Credits used", color: "var(--chart-2)" },
                    }}
                    className="h-48 w-full"
                  >
                    <AreaChart data={trend}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date: string) => date.slice(5)}
                        minTickGap={24}
                        tickLine={false}
                      />
                      <YAxis yAxisId="sessions" allowDecimals={false} width={35} />
                      <YAxis
                        yAxisId="credits"
                        orientation="right"
                        allowDecimals={false}
                        width={35}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        yAxisId="sessions"
                        type="monotone"
                        dataKey="count"
                        fill="var(--primary)"
                        fillOpacity={0.16}
                        stroke="var(--primary)"
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="credits"
                        type="monotone"
                        dataKey="credits"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                </Panel>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                  <Panel title="Channels">
                    <p className="text-sm">
                      Web Widget{" "}
                      <span className="float-right">
                        {data.channels.webWidgetActive ? "Active" : "Inactive"}
                      </span>
                    </p>
                    <p className="mt-3 text-sm">
                      WhatsApp{" "}
                      <span className="float-right">
                        {data.channels.whatsAppConnected ? "Connected" : "Disconnected"}
                      </span>
                    </p>
                  </Panel>
                  <Panel title="AI Agents">
                    <p className="text-sm">
                      AI turns{" "}
                      <span className="float-right">
                        {numberFormat.format(data.aiUsage.summary.totals.turnCount)}
                      </span>
                    </p>
                    <p className="mt-3 text-sm">
                      Tokens in / out{" "}
                      <span className="float-right">
                        {numberFormat.format(data.aiUsage.summary.totals.inputTokens)} /{" "}
                        {numberFormat.format(data.aiUsage.summary.totals.outputTokens)}
                      </span>
                    </p>
                  </Panel>
                  <Panel title="Knowledge Sources">
                    {data.knowledgeSources.length ? (
                      data.knowledgeSources.map((row) => (
                        <p key={row.status} className="mt-2 text-sm">
                          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}{" "}
                          <span className="float-right">{row.count}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No Knowledge Sources</p>
                    )}
                  </Panel>
                  <Panel title="Users & roles">
                    <p className="text-sm">
                      Admins{" "}
                      <span className="float-right">
                        {data.users.filter((user) => user.role === "ADMIN").length}
                      </span>
                    </p>
                    <p className="mt-3 text-sm">
                      Human Agents{" "}
                      <span className="float-right">
                        {data.users.filter((user) => user.role === "HUMAN_AGENT").length}
                      </span>
                    </p>
                  </Panel>
                </div>
                <Panel title="Support outcomes" contentClassName="min-h-36">
                  <ConsoleDataTable>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <SortButton
                              label="Resolution reason"
                              column="reason"
                              sort={sort}
                              onSort={changeSort}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton
                              label="Tickets"
                              column="count"
                              sort={sort}
                              onSort={changeSort}
                            />
                          </TableHead>
                          <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outcomes.length ? (
                          outcomes.map((row) => (
                            <TableRow key={row.reason}>
                              <TableCell>{outcomeLabels[row.reason] ?? row.reason}</TableCell>
                              <TableCell className="text-right">
                                {numberFormat.format(row.count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {outcomeTotal ? Math.round((row.count / outcomeTotal) * 100) : 0}%
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No resolved Tickets in this period.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ConsoleDataTable>
                </Panel>
              </div>
              <div className="space-y-4">
                <Panel
                  title="Needs attention"
                  contentClassName="min-h-24"
                  action={
                    <Link to="/needs-attention" className="text-xs text-primary">
                      View all →
                    </Link>
                  }
                >
                  {data.attention.conditions.length ? (
                    data.attention.conditions.map((condition) => (
                      <div
                        key={condition}
                        className="flex items-center justify-between gap-2 border-b py-2 last:border-0"
                      >
                        <span className="text-sm">{conditionLabel[condition]}</span>
                        {condition === "LOW_BALANCE" || condition === "CREDIT_EXHAUSTED" ? (
                          <Button size="sm" variant="outline" onClick={() => setTopUpOpen(true)}>
                            Top up
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {condition === "INACTIVE"
                              ? formatDateTime(data.attention.lastCustomerActivityAt)
                              : formatDate(data.attention.activeUnlimitedPeriod?.endAt ?? null)}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No current issues.</p>
                  )}
                </Panel>
                <Panel
                  title="Billing & credits"
                  action={
                    <Link to="/ai-usage-economics" className="text-xs text-primary">
                      View usage →
                    </Link>
                  }
                >
                  <dl className="divide-y text-sm">
                    <div className="flex justify-between py-2">
                      <dt>Current balance</dt>
                      <dd>{numberFormat.format(data.aiUsage.summary.balance)} credits</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt>Credits topped up this month</dt>
                      <dd>{numberFormat.format(data.billing.toppedUpThisMonth)}</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt>Credits consumed this month</dt>
                      <dd>{numberFormat.format(data.billing.spentThisMonth)}</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt>Unlimited Period</dt>
                      <dd>
                        {data.attention.activeUnlimitedPeriod
                          ? data.attention.activeUnlimitedPeriod.endAt
                            ? `Until ${formatDate(data.attention.activeUnlimitedPeriod.endAt)}`
                            : "No end date"
                          : "None"}
                      </dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt>Last paid Top-Up</dt>
                      <dd>{formatDate(data.billing.lastPayment?.paidAt ?? null)}</dd>
                    </div>
                  </dl>
                </Panel>
                <Panel
                  title="Operator actions"
                  contentClassName="min-h-24"
                  action={
                    <Link to="/audit-log" className="text-xs text-primary">
                      View all →
                    </Link>
                  }
                >
                  {actions.isError ? (
                    <p className="text-xs text-destructive">Failed to load actions.</p>
                  ) : actions.data?.actions.length ? (
                    actions.data.actions.slice(0, 4).map((action) => (
                      <div
                        key={action.id}
                        className="grid grid-cols-[1fr_auto] gap-2 border-b py-2 text-xs last:border-0"
                      >
                        <span>
                          {actionLabels[action.type]} · {action.operator.name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateTime(action.createdAt)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No operator actions.</p>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    </ConsoleShell>
  );
}

function isActive(period: UnlimitedPeriod | null): period is UnlimitedPeriod {
  return (
    Boolean(period) &&
    !period?.endedEarlyAt &&
    (!period?.endAt || new Date(period.endAt) > new Date())
  );
}

function UnlimitedPeriodDialog({
  workspaceId,
  unlimitedPeriod,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  unlimitedPeriod: UnlimitedPeriod | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const active = isActive(unlimitedPeriod);
  const [endDate, setEndDate] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const periodEnd = unlimitedPeriod?.endAt;
      setIndefinite(active && !periodEnd);
      setEndDate(
        active && periodEnd
          ? new Date(periodEnd).toLocaleDateString("en-CA", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "",
      );
    }
  }, [open, active, unlimitedPeriod?.endAt]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["operator", "workspace", workspaceId] });

  const grant = useMutation({
    mutationFn: (date: string | null) => grantUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
      onOpenChange(false);
    },
  });
  const extend = useMutation({
    mutationFn: (date: string | null) => extendUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
      onOpenChange(false);
    },
  });
  const endEarly = useMutation({
    mutationFn: () => endUnlimitedPeriodEarly(api, workspaceId),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const mutation = active ? extend : grant;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlimited Period</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {active ? (
            unlimitedPeriod?.endAt ? (
              <>
                Active until{" "}
                <span className="font-medium">{formatDate(unlimitedPeriod.endAt)}</span>
              </>
            ) : (
              "Active without an end date"
            )
          ) : (
            "No active Unlimited Period."
          )}
        </p>
        <div className="flex items-center gap-2">
          <Switch id="indefinite-unlimited" checked={indefinite} onCheckedChange={setIndefinite} />
          <label htmlFor="indefinite-unlimited" className="text-sm">
            No end date
          </label>
        </div>
        {!indefinite && (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-fit justify-start">
                <CalendarIcon className="size-4" />
                {endDate ? dateFormat.format(new Date(`${endDate}T00:00:00`)) : "Choose end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={endDate ? new Date(`${endDate}T00:00:00`) : undefined}
                disabled={{ before: new Date() }}
                onSelect={(date) => {
                  if (date) {
                    setEndDate(
                      new Intl.DateTimeFormat("en-CA", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }).format(date),
                    );
                    setCalendarOpen(false);
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={(!indefinite && !endDate) || mutation.isPending}
            onClick={() => mutation.mutate(indefinite ? null : endDate)}
          >
            {active ? "Update" : "Grant"}
          </Button>
          {active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={endEarly.isPending}>
                  End early
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End this Unlimited Period now?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The Workspace goes back to spending its own Credits immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => endEarly.mutate()}>End early</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {(grant.isError || extend.isError || endEarly.isError) && (
          <p className="text-sm text-destructive">
            {(grant.error ?? extend.error ?? endEarly.error) instanceof Error
              ? ((grant.error ?? extend.error ?? endEarly.error) as Error).message
              : "Something went wrong."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
