import {
  endUnlimitedPeriodEarly, extendUnlimitedPeriod, fetchOperatorActions,
  fetchOperatorWorkspaceDetail, grantUnlimitedPeriod,
  type OperatorAction, type UnlimitedPeriod,
} from "@repo/api-client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/components/chart";
import { Input } from "@repo/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ActivityIcon, BotIcon, CoinsIcon, MessageSquareIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { ConsoleDataTable, ConsolePageHeader, ConsoleQueryState, ConsoleStatusBadge } from "../../../console/components/console-patterns";
import DateRangePicker, { trailingRange, type ConsoleDateRange } from "../../../console/components/date-range-picker";
import { conditionLabel } from "../../../console/views/at-risk/at-risk";
import { ConsoleShell } from "../../../console/shell";
import { api } from "../../../../lib/api";
import { TopUpDialog } from "./components/top-up-dialog";

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const tabs = ["Overview", "Channels", "AI agents", "Knowledge", "Billing", "Activity"] as const;
type Tab = typeof tabs[number];
const outcomeLabels: Record<string, string> = {
  HUMAN_RESOLVED: "Human resolved", CUSTOMER_CONFIRMED: "Customer confirmed",
  CUSTOMER_INACTIVE: "Customer inactive (AI)",
  CUSTOMER_INACTIVE_HUMAN_HANDLING: "Customer inactive (human)",
  CUSTOMER_INACTIVE_SHARED_QUEUE: "Customer inactive (queue)",
};
const actionLabels: Record<OperatorAction["type"], string> = {
  TOP_UP: "Manual Top-Up", UNLIMITED_PERIOD_GRANTED: "Unlimited Period granted",
  UNLIMITED_PERIOD_EXTENDED: "Unlimited Period extended", UNLIMITED_PERIOD_ENDED: "Unlimited Period ended",
};
function formatDate(value: string | null) { return value ? dateFormat.format(new Date(value)) : "—"; }
function formatDateTime(value: string | null) { return value ? dateTimeFormat.format(new Date(value)) : "Never"; }
function Change({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  if (previous === 0) return <span className="text-muted-foreground">{current ? "New" : "0%"} vs. previous period</span>;
  const change = Math.round((current - previous) / previous * 100);
  return <span className={change && (change > 0) === goodWhenUp ? "text-emerald-500" : change ? "text-destructive" : "text-muted-foreground"}>{change > 0 ? "+" : ""}{change}% vs. previous period</span>;
}
function Metric({ icon, label, value, hint, change }: { icon: ReactNode; label: string; value: string; hint?: string; change?: ReactNode }) {
  return <Card className="gap-0 py-0"><CardContent className="flex min-h-28 items-start gap-3 p-4">
    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</div>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-xl font-semibold" title={value}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p>{change && <p className="mt-1 text-xs">{change}</p>}</div>
  </CardContent></Card>;
}
function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Card className="min-w-0 gap-0 py-0"><CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3"><CardTitle className="text-sm">{title}</CardTitle>{action}</CardHeader><CardContent className="p-4">{children}</CardContent></Card>;
}
function SortButton({ label, column, sort, onSort }: { label: string; column: string; sort: { column: string; descending: boolean }; onSort: (column: string) => void }) {
  return <button type="button" onClick={() => onSort(column)} aria-label={`Sort by ${label}${sort.column === column ? sort.descending ? ", descending" : ", ascending" : ""}`} className="cursor-pointer hover:text-foreground">{label} {sort.column === column ? sort.descending ? "↓" : "↑" : "↕"}</button>;
}
export default function WorkspaceDetailView({ workspaceId }: { workspaceId: string }) {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const [tab, setTab] = useState<Tab>("Overview");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [sort, setSort] = useState({ column: "count", descending: true });
  const changeSort = (column: string) => setSort((old) => ({ column, descending: old.column === column ? !old.descending : column === "count" || column === "createdAt" }));
  const detail = useQuery({ queryKey: ["operator", "workspace", workspaceId, range.from, range.to], queryFn: () => fetchOperatorWorkspaceDetail(api, workspaceId, range) });
  const actions = useQuery({ queryKey: ["operator", "actions", workspaceId], queryFn: () => fetchOperatorActions(api, { workspaceId }), enabled: tab === "Overview" || tab === "Activity" });
  const data = detail.data;
  const outcomes = [...(data?.outcomes ?? [])].sort((a, b) => sort.column === "reason" ? (a.reason.localeCompare(b.reason) * (sort.descending ? -1 : 1)) : (a.count - b.count) * (sort.descending ? -1 : 1));
  const outcomeTotal = outcomes.reduce((sum, row) => sum + row.count, 0);
  const sortedAgents = [...(data?.aiAgents ?? [])].sort((a, b) => (sort.column === "status" ? a.status.localeCompare(b.status) : sort.column === "agentModel" ? a.agentModel.localeCompare(b.agentModel) : a.name.localeCompare(b.name)) * (sort.descending ? -1 : 1));
  const sortedModels = [...(data?.aiUsage.summary.byModel ?? [])].sort((a, b) => (sort.column === "turnCount" ? a.turnCount - b.turnCount : sort.column === "creditsSpent" ? a.creditsSpent - b.creditsSpent : a.agentModel.localeCompare(b.agentModel)) * (sort.descending ? -1 : 1));
  const sortedUsers = [...(data?.users ?? [])].sort((a, b) => (sort.column === "role" ? a.role.localeCompare(b.role) : sort.column === "lastSignInAt" ? (a.lastSignInAt ?? "").localeCompare(b.lastSignInAt ?? "") : a.name.localeCompare(b.name)) * (sort.descending ? -1 : 1));
  const sortedActions = [...(actions.data?.actions ?? [])].sort((a, b) => (sort.column === "operator" ? a.operator.name.localeCompare(b.operator.name) : sort.column === "type" ? a.type.localeCompare(b.type) : a.createdAt.localeCompare(b.createdAt)) * (sort.descending ? -1 : 1));
  const trend = data?.sessions.daily.map((row, index) => ({ ...row, credits: data.aiUsage.summary.daily[index]?.creditsSpent ?? 0 })) ?? [];
  return <ConsoleShell><div className="space-y-4">
    {detail.isPending || detail.isError || !data ? <ConsoleQueryState isPending={detail.isPending} isError={detail.isError} error={detail.error} isEmpty={!detail.isPending && !detail.isError && data === null} emptyTitle="Workspace not found" onRetry={() => void detail.refetch()} /> : <>
      <ConsolePageHeader title={data.workspace.name} description={`${data.workspace.slug} · Created ${formatDate(data.workspace.createdAt)}`} actions={<div className="flex flex-wrap items-center gap-2"><DateRangePicker range={range} onChange={setRange} /><Button variant="outline" size="sm" onClick={() => void Promise.all([detail.refetch(), actions.refetch()])}><RefreshCwIcon className="mr-1 size-3.5" />Refresh</Button><span className="text-xs text-muted-foreground">Updated {formatDateTime(new Date(detail.dataUpdatedAt).toISOString())}</span><Button size="sm" onClick={() => setTopUpOpen(true)}>Top up credits</Button></div>} />
      <TopUpDialog workspaceId={workspaceId} balance={data.aiUsage.summary.balance} open={topUpOpen} onOpenChange={setTopUpOpen} />
      <div className="flex flex-wrap gap-2 text-xs">{data.attention.conditions.length ? <ConsoleStatusBadge tone="warning">Needs attention</ConsoleStatusBadge> : <ConsoleStatusBadge tone="success">Healthy</ConsoleStatusBadge>}{data.attention.activeUnlimitedPeriod ? <ConsoleStatusBadge tone="success">Unlimited Period active</ConsoleStatusBadge> : null}<Badge variant="outline">{data.channels.webWidgetActive ? "Web Widget active" : "Web Widget inactive"}</Badge><Badge variant="outline">{data.channels.whatsAppConnected ? "WhatsApp connected" : "WhatsApp disconnected"}</Badge></div>
      <section aria-label="Workspace summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Metric icon={<TriangleAlertIcon />} label="Health status" value={data.attention.conditions.length ? "Needs attention" : "Healthy"} hint={data.attention.conditions.map((c) => conditionLabel[c]).join(", ") || "No current issues"} />
        <Metric icon={<CoinsIcon />} label="Balance" value={`${numberFormat.format(data.aiUsage.summary.balance)} credits`} hint={data.attention.conditions.includes("LOW_BALANCE") ? "Low balance" : undefined} />
        <Metric icon={<MessageSquareIcon />} label="Sessions" value={numberFormat.format(data.sessions.count)} change={<Change current={data.sessions.count} previous={data.sessions.previousCount} />} />
        <Metric icon={<ActivityIcon />} label="Credits used" value={numberFormat.format(data.aiUsage.summary.totals.creditsSpent)} change={<Change current={data.aiUsage.summary.totals.creditsSpent} previous={data.aiUsage.summary.previousTotals.creditsSpent} goodWhenUp={false} />} />
        <Metric icon={<MessageSquareIcon />} label="Last customer message" value={formatDateTime(data.attention.lastCustomerActivityAt)} hint={data.attention.lastCustomerActivityAt ? `${Math.floor((Date.now() - new Date(data.attention.lastCustomerActivityAt).getTime()) / 86400000)} days ago` : "No messages yet"} />
        <Metric icon={<BotIcon />} label="Active AI Agents" value={numberFormat.format(data.aiAgents.filter((agent) => agent.status === "ACTIVE").length)} hint={`${data.aiAgents.length} total AI Agents`} />
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Workspace overview" action={<span className="text-xs text-muted-foreground">Selected period</span>}><div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Sessions and Credits used per day</span><span><span className="text-primary">●</span> Sessions <span className="ml-2 text-[var(--chart-2)]">●</span> Credits used</span></div><ChartContainer config={{ count: { label: "Sessions", color: "var(--primary)" }, credits: { label: "Credits used", color: "var(--chart-2)" } }} className="h-48 w-full"><AreaChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} minTickGap={24} tickLine={false} /><YAxis yAxisId="sessions" allowDecimals={false} width={35} /><YAxis yAxisId="credits" orientation="right" allowDecimals={false} width={35} /><ChartTooltip content={<ChartTooltipContent />} /><Area yAxisId="sessions" type="monotone" dataKey="count" fill="var(--primary)" fillOpacity={0.16} stroke="var(--primary)" strokeWidth={2} /><Line yAxisId="credits" type="monotone" dataKey="credits" stroke="var(--chart-2)" strokeWidth={2} dot={false} /></AreaChart></ChartContainer></Panel>
          <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Workspace details">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setSort({ column: item === "Overview" ? "count" : item === "Activity" ? "createdAt" : "name", descending: item === "Overview" || item === "Activity" }); }} className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === item ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item}</button>)}</div>
          {tab === "Overview" && <><div className="grid gap-3 md:grid-cols-2"><Panel title="Channels"><p className="text-sm">Web Widget <span className="float-right">{data.channels.webWidgetActive ? "Active" : "Inactive"}</span></p><p className="mt-3 text-sm">WhatsApp <span className="float-right">{data.channels.whatsAppConnected ? "Connected" : "Disconnected"}</span></p></Panel><Panel title="AI Agents"><p className="text-sm">Total <span className="float-right">{data.aiAgents.length}</span></p><p className="mt-3 text-sm">AI Turns <span className="float-right">{numberFormat.format(data.aiUsage.summary.totals.turnCount)}</span></p></Panel><Panel title="Knowledge Sources">{data.knowledgeSources.length ? data.knowledgeSources.map((row) => <p key={row.status} className="mt-2 text-sm">{row.status} <span className="float-right">{row.count}</span></p>) : <p className="text-sm text-muted-foreground">No Knowledge Sources</p>}</Panel><Panel title="Users & roles"><p className="text-sm">Total users <span className="float-right">{data.users.length}</span></p><p className="mt-3 text-sm">Admins <span className="float-right">{data.users.filter((user) => user.role === "ADMIN").length}</span></p><p className="mt-3 text-sm">Human Agents <span className="float-right">{data.users.filter((user) => user.role === "HUMAN_AGENT").length}</span></p></Panel></div><Panel title="Support outcomes"><ConsoleDataTable><Table><TableHeader><TableRow><TableHead><SortButton label="Resolution reason" column="reason" sort={sort} onSort={changeSort} /></TableHead><TableHead className="text-right"><SortButton label="Tickets" column="count" sort={sort} onSort={changeSort} /></TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader><TableBody>{outcomes.length ? outcomes.map((row) => <TableRow key={row.reason}><TableCell>{outcomeLabels[row.reason] ?? row.reason}</TableCell><TableCell className="text-right">{numberFormat.format(row.count)}</TableCell><TableCell className="text-right">{outcomeTotal ? Math.round(row.count / outcomeTotal * 100) : 0}%</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No resolved Tickets in this period.</TableCell></TableRow>}</TableBody></Table></ConsoleDataTable></Panel></>}
          {tab === "Channels" && <Panel title="Channels"><p className="text-sm">Web Widget: {data.channels.webWidgetActive ? "Active" : "Inactive"}</p><p className="mt-3 text-sm">WhatsApp: {data.channels.whatsAppConnected ? "Connected" : "Disconnected"}</p></Panel>}
          {tab === "AI agents" && <Panel title="AI Agents"><ConsoleDataTable><Table><TableHeader><TableRow><TableHead><SortButton label="Name" column="name" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Status" column="status" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Agent Model" column="agentModel" sort={sort} onSort={changeSort} /></TableHead></TableRow></TableHeader><TableBody>{sortedAgents.map((agent) => <TableRow key={agent.id}><TableCell>{agent.name}</TableCell><TableCell>{agent.status}</TableCell><TableCell>{agent.agentModel}</TableCell></TableRow>)}</TableBody></Table></ConsoleDataTable></Panel>}
          {tab === "Knowledge" && <Panel title="Knowledge Sources">{data.knowledgeSources.length ? data.knowledgeSources.map((row) => <p key={row.status} className="mb-2 text-sm">{row.status}: {row.count}</p>) : <p className="text-sm text-muted-foreground">No Knowledge Sources.</p>}</Panel>}
          {tab === "Billing" && <><Panel title="AI Usage"><p className="text-sm">Sessions: {numberFormat.format(data.aiUsage.summary.totals.sessionCount)} · AI Turns: {numberFormat.format(data.aiUsage.summary.totals.turnCount)}</p><p className="mt-2 text-sm">Tokens in / out: {numberFormat.format(data.aiUsage.summary.totals.inputTokens)} / {numberFormat.format(data.aiUsage.summary.totals.outputTokens)}</p></Panel><Panel title="Credits by Agent Model"><ConsoleDataTable><Table><TableHeader><TableRow><TableHead><SortButton label="Agent Model" column="agentModel" sort={sort} onSort={changeSort} /></TableHead><TableHead className="text-right"><SortButton label="Turns" column="turnCount" sort={sort} onSort={changeSort} /></TableHead><TableHead className="text-right"><SortButton label="Credits used" column="creditsSpent" sort={sort} onSort={changeSort} /></TableHead></TableRow></TableHeader><TableBody>{sortedModels.map((row) => <TableRow key={row.agentModel}><TableCell>{row.agentModel}</TableCell><TableCell className="text-right">{row.turnCount}</TableCell><TableCell className="text-right">{row.creditsSpent}</TableCell></TableRow>)}</TableBody></Table></ConsoleDataTable></Panel><UnlimitedPeriodCard workspaceId={workspaceId} unlimitedPeriod={data.unlimitedPeriod} /></>}
          {tab === "Activity" && <><Panel title="Operator actions">{actions.isPending ? <p className="text-sm text-muted-foreground">Loading actions…</p> : actions.isError ? <p className="text-sm text-destructive">Failed to load actions.</p> : sortedActions.length === 0 ? <p className="text-sm text-muted-foreground">No operator actions.</p> : <ConsoleDataTable><Table><TableHeader><TableRow><TableHead><SortButton label="Action" column="type" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Operator" column="operator" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Date & time" column="createdAt" sort={sort} onSort={changeSort} /></TableHead></TableRow></TableHeader><TableBody>{sortedActions.map((action) => <TableRow key={action.id}><TableCell>{actionLabels[action.type]}</TableCell><TableCell>{action.operator.name}</TableCell><TableCell>{formatDateTime(action.createdAt)}</TableCell></TableRow>)}</TableBody></Table></ConsoleDataTable>}</Panel><Panel title="Users"><ConsoleDataTable><Table><TableHeader><TableRow><TableHead><SortButton label="Person" column="name" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Role" column="role" sort={sort} onSort={changeSort} /></TableHead><TableHead><SortButton label="Last sign-in" column="lastSignInAt" sort={sort} onSort={changeSort} /></TableHead></TableRow></TableHeader><TableBody>{sortedUsers.map((user) => <TableRow key={user.id}><TableCell>{user.name}<p className="text-xs text-muted-foreground">{user.email}</p></TableCell><TableCell>{user.role === "ADMIN" ? "Admin" : "Human Agent"}</TableCell><TableCell>{formatDateTime(user.lastSignInAt)}</TableCell></TableRow>)}</TableBody></Table></ConsoleDataTable></Panel></>}
        </div>
        <div className="space-y-4"><Panel title="Needs attention" action={<Link to="/needs-attention" className="text-xs text-primary">View all →</Link>}>{data.attention.conditions.length ? data.attention.conditions.map((condition) => <div key={condition} className="flex items-center justify-between gap-2 border-b py-2 last:border-0"><span className="text-sm">{conditionLabel[condition]}</span>{condition === "LOW_BALANCE" || condition === "CREDIT_EXHAUSTED" ? <Button size="sm" variant="outline" onClick={() => setTopUpOpen(true)}>Top up</Button> : <span className="text-xs text-muted-foreground">{condition === "INACTIVE" ? formatDateTime(data.attention.lastCustomerActivityAt) : formatDate(data.attention.activeUnlimitedPeriod?.endAt ?? null)}</span>}</div>) : <p className="text-sm text-muted-foreground">No current issues.</p>}</Panel><Panel title="Billing & credits" action={<button className="text-xs text-primary" onClick={() => setTab("Billing")}>View billing →</button>}><dl className="divide-y text-sm"><div className="flex justify-between py-2"><dt>Current balance</dt><dd>{numberFormat.format(data.aiUsage.summary.balance)} credits</dd></div><div className="flex justify-between py-2"><dt>Credits topped up this month</dt><dd>{numberFormat.format(data.billing.toppedUpThisMonth)}</dd></div><div className="flex justify-between py-2"><dt>Credits consumed this month</dt><dd>{numberFormat.format(data.billing.spentThisMonth)}</dd></div><div className="flex justify-between py-2"><dt>Unlimited Period</dt><dd>{data.attention.activeUnlimitedPeriod ? `Until ${formatDate(data.attention.activeUnlimitedPeriod.endAt)}` : "None"}</dd></div><div className="flex justify-between py-2"><dt>Last paid Top-Up</dt><dd>{formatDate(data.billing.lastPayment?.paidAt ?? null)}</dd></div></dl></Panel><Panel title="Operator actions" action={<button className="text-xs text-primary" onClick={() => setTab("Activity")}>View all →</button>}>{actions.isError ? <p className="text-xs text-destructive">Failed to load actions.</p> : actions.data?.actions.length ? actions.data.actions.slice(0, 4).map((action) => <div key={action.id} className="grid grid-cols-[1fr_auto] gap-2 border-b py-2 text-xs last:border-0"><span>{actionLabels[action.type]} · {action.operator.name}</span><span className="text-muted-foreground">{formatDateTime(action.createdAt)}</span></div>) : <p className="text-sm text-muted-foreground">No operator actions.</p>}</Panel></div>
      </div>
    </>}
  </div></ConsoleShell>;
}

function isActive(period: UnlimitedPeriod | null): period is UnlimitedPeriod {
  return Boolean(period) && !period!.endedEarlyAt && new Date(period!.endAt) > new Date();
}

function UnlimitedPeriodCard({
  workspaceId,
  unlimitedPeriod,
}: {
  workspaceId: string;
  unlimitedPeriod: UnlimitedPeriod | null;
}) {
  const queryClient = useQueryClient();
  const active = isActive(unlimitedPeriod);
  const [endDate, setEndDate] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["operator", "workspace", workspaceId] });

  const grant = useMutation({
    mutationFn: (date: string) => grantUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
    },
  });
  const extend = useMutation({
    mutationFn: (date: string) => extendUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
    },
  });
  const endEarly = useMutation({
    mutationFn: () => endUnlimitedPeriodEarly(api, workspaceId),
    onSuccess: invalidate,
  });

  const mutation = active ? extend : grant;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlimited Period</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {active ? (
            <>
              Active until <span className="font-medium">{formatDate(unlimitedPeriod!.endAt)}</span>
            </>
          ) : (
            "No active Unlimited Period."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="Unlimited Period end date"
            className="w-40"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <Button
            size="sm"
            disabled={!endDate || mutation.isPending}
            onClick={() => mutation.mutate(endDate)}
          >
            {active ? "Extend" : "Grant"}
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
      </CardContent>
    </Card>
  );
}
