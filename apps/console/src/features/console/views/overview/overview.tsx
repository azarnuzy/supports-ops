import { fetchOperatorActions, type OperatorAction, type OperatorOverview, type OperatorResolutionReason } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, BarChart3Icon,
  Building2Icon, CircleDollarSignIcon, Clock3Icon, CoinsIcon, FileTextIcon,
  MessageSquareIcon, RefreshCwIcon, TriangleAlertIcon,
  UserRoundPlusIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/components/chart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import { ConsolePageHeader, ConsoleQueryState } from "../../components/console-patterns";
import DateRangePicker, { type ConsoleDateRange, trailingRange } from "../../components/date-range-picker";
import { conditionLabel, operatorAtRiskQueryOptions } from "../at-risk/at-risk";
import { platformAnalyticsTrendsQueryOptions } from "../platform-analytics/platform-analytics.services";
import { api } from "../../../../lib/api";
import { operatorOverviewQueryOptions } from "./overview.services";
import { formatCount, formatIdr } from "./overview.utils";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const conditions = ["LOW_BALANCE", "UNLIMITED_ENDING_SOON", "INACTIVE"] as const;
const outcomeReasons: { key: OperatorResolutionReason; label: string; color: string; hint?: string }[] = [
  {
    key: "CUSTOMER_INACTIVE", label: "Customer inactive (AI)", color: "var(--chart-1)",
    hint: "Ticket closed automatically after the customer stopped responding to the AI.",
  },
  { key: "HUMAN_RESOLVED", label: "Human resolved", color: "var(--chart-2)" },
  { key: "CUSTOMER_CONFIRMED", label: "Customer confirmed", color: "var(--chart-3)" },
  { key: "CUSTOMER_INACTIVE_HUMAN_HANDLING", label: "Inactive (human)", color: "var(--chart-4)" },
  { key: "CUSTOMER_INACTIVE_SHARED_QUEUE", label: "Inactive (queue)", color: "var(--chart-5)" },
] as const;
const channelColors: Record<string, string> = { WEB: "var(--primary)", WHATSAPP: "var(--chart-2)" };
const actionLabels: Record<OperatorAction["type"], string> = {
  TOP_UP: "Top-Up",
  UNLIMITED_PERIOD_GRANTED: "Unlimited Period granted",
  UNLIMITED_PERIOD_EXTENDED: "Unlimited Period extended",
  UNLIMITED_PERIOD_ENDED: "Unlimited Period ended",
};

function Change({ current, previous, goodWhenUp = true }: {
  current: number; previous: number; goodWhenUp?: boolean;
}) {
  if (previous === 0) {
    return <span className="text-muted-foreground">— {current === 0 ? "0%" : "New"}</span>;
  }
  const change = Math.round((current - previous) / previous * 100);
  if (change === 0) return <span className="text-muted-foreground">— 0%</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5", (change > 0) === goodWhenUp ? "text-emerald-500" : "text-destructive")}>
      {change > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(change)}%
    </span>
  );
}

function Metric({ icon, label, hint, value, current, previous, tone, goodWhenUp }: {
  icon: ReactNode; label: string; hint: string; value: string; current: number; previous: number;
  tone: string; goodWhenUp?: boolean;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex min-h-[130px] items-center gap-3 p-4">
        <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5", tone)}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground" title={label}>{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight" title={value}>{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          <p className="mt-0.5 text-xs"><Change current={current} previous={previous} goodWhenUp={goodWhenUp} /> <span className="text-muted-foreground">vs. previous period</span></p>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionsChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <Card className="h-full min-h-[230px] min-w-0 gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Sessions trend</h2>
            <p className="mt-1 text-xs text-muted-foreground">Sessions across all channels in the selected period</p>
          </div>
          <Link to="/platform-analytics" className="shrink-0 text-xs text-primary hover:underline">Explore analytics ↗</Link>
        </div>
        <ChartContainer config={{ count: { label: "Sessions", color: "var(--primary)" } }} className="mt-4 h-40 w-full">
          <AreaChart data={data} margin={{ top: 8, left: 0, right: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="overviewSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(date: string) => date.slice(5)} />
            <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="dot" />} />
            <Area type="monotone" dataKey="count" stroke="var(--primary)" fill="url(#overviewSessions)" strokeWidth={2} dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 4 }} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function OutcomeCard({ reasons }: { reasons: OperatorOverview["tickets"]["resolvedByReason"] }) {
  const rows = outcomeReasons.map(({ key, label, color, hint }) => ({ label, color, hint, count: reasons[key] }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let offset = 0;
  const segments = rows.map((row) => {
    const start = offset;
    offset += total ? row.count / total * 100 : 0;
    return `${row.color} ${start}% ${offset}%`;
  });
  return (
    <Card className="h-full min-h-[230px] min-w-0 gap-0 py-0">
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold">Ticket outcomes</h2>
        <p className="mt-1 text-xs text-muted-foreground">Tickets by outcome in selected period</p>
        {total === 0 ? <p className="grid h-40 place-items-center text-xs text-muted-foreground">No resolved Tickets in this range.</p> : (
          <div className="mt-4 flex items-center gap-4">
            <div className="grid size-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }}
              role="img" aria-label={`${formatCount(total)} resolved Tickets by resolution reason`}>
              <div className="grid size-24 place-content-center rounded-full bg-card text-center">
                <strong className="text-lg tabular-nums">{formatCount(total)}</strong>
                <span className="text-xs text-muted-foreground">Tickets</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs">
                  <span className="size-2.5 rounded-sm" style={{ background: row.color }} />
                  {row.hint ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate text-muted-foreground underline decoration-dotted" title={row.label}>{row.label}</span>
                        </TooltipTrigger>
                        <TooltipContent>{row.hint}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="truncate text-muted-foreground" title={row.label}>{row.label}</span>
                  )}
                  <span className="tabular-nums">{Math.round(row.count / total * 100)}%</span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{formatCount(row.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelCard({ sessions }: { sessions: OperatorOverview["sessions"] }) {
  const rows = [
    { key: "WEB", label: "Web Widget", count: sessions.WEB },
    { key: "WHATSAPP", label: "WhatsApp", count: sessions.WHATSAPP },
  ] as const;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold">Channel mix</h2>
        <p className="mt-1 text-xs text-muted-foreground">Sessions by channel</p>
        {total === 0 ? <p className="grid h-40 place-items-center text-xs text-muted-foreground">No Sessions in this range.</p> : (
          <div className="mt-6 space-y-5">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[5rem_minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{row.label}</span>
                <div className="h-3 overflow-hidden rounded bg-muted" role="img" aria-label={`${row.label}: ${formatCount(row.count)} Sessions`}>
                  <div className="h-full rounded" style={{ width: `${row.count / total * 100}%`, background: channelColors[row.key] }} />
                </div>
                <span className="text-right font-semibold tabular-nums">{Math.round(row.count / total * 100)}%</span>
                <span className="text-right tabular-nums text-muted-foreground">{formatCount(row.count)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewView() {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const trends = useQuery(platformAnalyticsTrendsQueryOptions(range));
  const atRisk = useQuery(operatorAtRiskQueryOptions);
  const actions = useQuery({
    queryKey: ["operator", "actions", "overview"],
    queryFn: () => fetchOperatorActions(api),
  });
  const data = overview.data?.overview;
  const workspaces = atRisk.data?.workspaces ?? [];
  const sessions = data ? Object.values(data.sessions).reduce((sum, count) => sum + count, 0) : 0;
  const fetching = overview.isFetching || trends.isFetching || atRisk.isFetching || actions.isFetching;

  return (
    <div className="flex flex-col gap-4">
      <ConsolePageHeader
        title="Overview"
        description="Platform health, activity, and operator priorities."
        actions={<>
          <DateRangePicker range={range} onChange={setRange} />
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => void Promise.all([overview.refetch(), trends.refetch(), atRisk.refetch(), actions.refetch()])}
            disabled={fetching}>
            <RefreshCwIcon className={cn("size-3.5", fetching && "animate-spin")} /> Refresh
          </Button>
          {overview.dataUpdatedAt ? <span className="text-xs text-muted-foreground">Updated {dateTimeFormat.format(new Date(overview.dataUpdatedAt))}</span> : null}
        </>}
      />

      {overview.isPending || overview.isError || !data ? (
        <ConsoleQueryState isPending={overview.isPending} isError={overview.isError} error={overview.error}
          isEmpty={!overview.isPending && !overview.isError && !data} emptyTitle="No overview data"
          onRetry={() => void overview.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label="Platform summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <Metric icon={<Building2Icon />} label="Active workspaces" hint="Had activity in selected period" value={formatCount(data.workspaces.active)}
              current={data.workspaces.active} previous={data.previous.activeWorkspaces} tone="bg-primary/10 text-primary" />
            <Metric icon={<UserRoundPlusIcon />} label="New workspaces" hint="Created in selected period" value={formatCount(data.workspaces.new)}
              current={data.workspaces.new} previous={data.previous.newWorkspaces} tone="bg-primary/10 text-primary" />
            <Metric icon={<MessageSquareIcon />} label="Sessions" hint="In selected period" value={formatCount(sessions)}
              current={sessions} previous={data.previous.sessions} tone="bg-primary/10 text-primary" />
            <Metric icon={<CoinsIcon />} label="Credits consumed" hint="In selected period" value={formatCount(data.credits.spent)}
              current={data.credits.spent} previous={data.previous.creditsSpent} tone="bg-chart-1/10 text-chart-1" />
            <Metric icon={<CircleDollarSignIcon />} label="Top-up revenue" hint="Paid top-ups in selected period" value={formatIdr(data.revenueIdr)}
              current={data.revenueIdr} previous={data.previous.revenueIdr} tone="bg-chart-2/10 text-chart-2" />
          </section>

          <section aria-label="Current attention conditions" className="flex min-h-[82px] items-center rounded-xl border bg-card px-4 py-3 shadow-sm">
            {atRisk.isPending || atRisk.isError ? (
              <ConsoleQueryState isPending={atRisk.isPending} isError={atRisk.isError} error={atRisk.error}
                onRetry={() => void atRisk.refetch()} className="min-h-20" />
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex min-w-56 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><TriangleAlertIcon className="size-5" /></span>
                  <div>
                    <p className="text-sm font-semibold"><span className="text-destructive">{formatCount(workspaces.length)}</span> {workspaces.length === 1 ? "workspace" : "workspaces"} require attention</p>
                    <p className="text-xs text-muted-foreground">Issues requiring operator review</p>
                  </div>
                </div>
                <p className="border-l pl-5 text-sm text-muted-foreground">
                  {conditions.map((condition) => `${workspaces.filter((workspace) => workspace.conditions.includes(condition)).length} ${conditionLabel[condition]}`).join(" · ")}
                </p>
                <Button asChild size="sm" variant="outline" className="ml-auto h-8 text-xs">
                  <Link to="/needs-attention">View all <ArrowRightIcon className="ml-1 size-3.5" /></Link>
                </Button>
              </div>
            )}
          </section>

          <section aria-label="Platform activity" className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.95fr)] [&>*]:min-w-0">
            <div className="lg:col-span-2 2xl:col-span-1">
              {trends.isPending || trends.isError || !trends.data ? (
                <Card><ConsoleQueryState isPending={trends.isPending} isError={trends.isError} error={trends.error}
                  isEmpty={!trends.isPending && !trends.isError && !trends.data} emptyTitle="No trend data"
                  onRetry={() => void trends.refetch()} /></Card>
              ) : <SessionsChart data={trends.data.sessions} />}
            </div>
            <OutcomeCard reasons={data.tickets.resolvedByReason} />
            <ChannelCard sessions={data.sessions} />
          </section>

          <section aria-label="Operator priorities" className="grid items-stretch gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <Card className="min-h-[290px] gap-0 py-0">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive"><TriangleAlertIcon className="size-4" /></span>
                    <div><h2 className="text-sm font-semibold">Workspaces requiring review</h2><p className="text-xs text-muted-foreground">Highest-priority workspace issues</p></div>
                  </div>
                  <Link to="/needs-attention" className="shrink-0 text-xs text-primary hover:underline">View all →</Link>
                </div>
                {atRisk.isPending || atRisk.isError || workspaces.length === 0 ? (
                  <ConsoleQueryState isPending={atRisk.isPending} isError={atRisk.isError} error={atRisk.error}
                    isEmpty={!atRisk.isPending && !atRisk.isError && workspaces.length === 0}
                    emptyTitle="All clear" emptyDescription="No Workspaces need attention right now."
                    onRetry={() => void atRisk.refetch()} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[570px] text-left text-xs">
                      <thead className="border-b bg-muted/30 text-muted-foreground">
                        <tr><th className="px-3 py-2 font-medium">Workspace</th><th className="px-2 py-2 font-medium">Issue</th><th className="px-2 py-2 text-right font-medium">Balance</th><th className="px-2 py-2 font-medium">Last customer activity</th><th className="px-3 py-2 font-medium">Action</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {[...workspaces].sort((a, b) => Number(b.conditions.includes("CREDIT_EXHAUSTED")) - Number(a.conditions.includes("CREDIT_EXHAUSTED"))).slice(0, 5).map((workspace) => {
                          const high = workspace.conditions.includes("CREDIT_EXHAUSTED");
                          const issue = high ? "CREDIT_EXHAUSTED" : workspace.conditions.includes("LOW_BALANCE") ? "LOW_BALANCE" : workspace.conditions.includes("UNLIMITED_ENDING_SOON") ? "UNLIMITED_ENDING_SOON" : "INACTIVE";
                          return (
                            <tr key={workspace.id}>
                              <td className="max-w-32 truncate px-3 py-2 font-medium"><Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="text-primary hover:underline">{workspace.name}</Link></td>
                              <td className="px-2 py-2 text-muted-foreground">{conditionLabel[issue]}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{formatCount(workspace.balance)}</td>
                              <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{workspace.lastCustomerActivityAt ? dateTimeFormat.format(new Date(workspace.lastCustomerActivityAt)) : "—"}</td>
                              <td className="px-3 py-2"><Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="text-primary hover:underline">{issue === "LOW_BALANCE" || high ? "Top up" : "Review"}</Link></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="border-t px-4 py-2 text-xs text-muted-foreground">Showing {Math.min(5, workspaces.length)} of {workspaces.length} Workspaces</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-h-[290px] gap-0 py-0">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><BarChart3Icon className="size-4" /></span><div><h2 className="text-sm font-semibold">Most active workspaces</h2><p className="text-xs text-muted-foreground">Sessions in selected period</p></div></div>
                  <Link to="/workspaces" className="shrink-0 text-xs text-primary hover:underline">View all →</Link>
                </div>
                {data.topWorkspaces.length === 0 ? <p className="grid min-h-40 place-items-center text-xs text-muted-foreground">No Sessions in this range.</p> : (
                  <div className="divide-y px-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem] gap-2 py-2 text-xs text-muted-foreground"><span>Workspace</span><span className="text-right">Sessions</span><span className="text-right">Δ previous</span></div>
                    {data.topWorkspaces.map((workspace) => (
                      <div key={workspace.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem] items-center gap-2 py-2.5 text-xs">
                        <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="truncate font-medium text-primary hover:underline" title={workspace.name}>{workspace.name}</Link>
                        <span className="text-right tabular-nums">{formatCount(workspace.sessions)}</span>
                        <span className="text-right"><Change current={workspace.sessions} previous={workspace.previousSessions} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-h-[290px] gap-0 py-0">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><FileTextIcon className="size-4" /></span><div><h2 className="text-sm font-semibold">Recent operator actions</h2><p className="text-xs text-muted-foreground">Latest administrative activity</p></div></div>
                  <Link to="/audit-log" className="shrink-0 text-xs text-primary hover:underline">View all →</Link>
                </div>
                {actions.isPending || actions.isError || !actions.data?.actions.length ? (
                  <ConsoleQueryState isPending={actions.isPending} isError={actions.isError} error={actions.error}
                    isEmpty={!actions.isPending && !actions.isError && !actions.data?.actions.length}
                    emptyTitle="No Operator Actions yet" onRetry={() => void actions.refetch()} />
                ) : (
                  <div className="divide-y px-4">
                    {actions.data.actions.slice(0, 5).map((action) => (
                      <div key={action.id} className="flex items-center gap-2 py-2.5 text-xs">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          {action.type === "TOP_UP" ? <CoinsIcon className="size-4" /> : <Clock3Icon className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{actionLabels[action.type]}</p>
                          <p className="truncate text-muted-foreground">{action.workspace?.name ?? "Workspace"}{action.type === "TOP_UP" && typeof action.payload.credits === "number" ? ` · +${formatCount(action.payload.credits)} Credits` : ""}</p>
                        </div>
                        <time className="shrink-0 text-right text-muted-foreground" dateTime={action.createdAt}>{dateTimeFormat.format(new Date(action.createdAt))}</time>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
