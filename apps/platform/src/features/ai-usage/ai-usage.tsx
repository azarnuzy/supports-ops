import type { AiUsageFilters, UsageChannel } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CoinsIcon,
  GaugeIcon,
  MessagesSquareIcon,
  TextIcon,
  TimerIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import { PlatformAppShell } from "../app-shell";
import { DateRangePicker, TrendCard } from "../dashboard/views/dashboard/components";
import { trailingRange } from "../dashboard/views/dashboard/dashboard.utils";
import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";
import { SettingsHeader } from "../settings/components/settings-header";
import {
  aiToolUsageQueryOptions,
  aiUsageSummaryQueryOptions,
  useCreditLedgerQuery,
} from "./ai-usage.hooks";
import {
  channelLabels,
  formatCredits,
  formatLatency,
  formatTokens,
  percentChange,
} from "./ai-usage.utils";
import {
  DailyChart,
  LedgerTable,
  StackedDailyChart,
  ToolTable,
  UsageBreakdownCard,
} from "./components";

const ALL = "ALL";

function LoadState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Unable to load AI Usage."}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function EmptyRange({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function OverviewPanel({ range, filters }: { range: DashboardRange; filters: AiUsageFilters }) {
  const summary = useQuery(aiUsageSummaryQueryOptions(range, filters));
  if (summary.isPending) return <PanelSkeleton />;
  if (summary.isError) return <LoadState error={summary.error} onRetry={() => summary.refetch()} />;

  const usage = summary.data.aiUsage;
  const { totals, previousTotals } = usage;
  const tokens = totals.inputTokens + totals.outputTokens;
  const cachedShare = totals.inputTokens
    ? (totals.cachedInputTokens / totals.inputTokens) * 100
    : 0;
  const tokensOf = (row: { inputTokens: number; outputTokens: number }) =>
    row.inputTokens + row.outputTokens;

  if (totals.turnCount === 0) {
    return (
      <EmptyRange
        title="No AI Usage in this range"
        description="Once your AI Agent handles a Customer message, Credit usage and conversations will show up here."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TrendCard
          icon={CoinsIcon}
          title="Credits spent"
          accent="primary"
          deltaTone="up-is-bad"
          info="Credits spent when AI handles Customer messages or sends Follow-Ups after a Ticket opens. Each use costs its Agent Model's rate, however many Tokens it used."
          value={formatCredits(totals.creditsSpent)}
          subtext={`${formatCredits(usage.balance)} Credits left`}
          series={usage.daily.map((day) => day.creditsSpent)}
          delta={percentChange(totals.creditsSpent, previousTotals.creditsSpent)}
        />
        <TrendCard
          icon={MessagesSquareIcon}
          title="Conversations"
          accent="resolved"
          deltaTone="up-is-good"
          info="Distinct conversations with recorded AI usage during the selected range. One conversation may use several Credits."
          value={formatCredits(totals.sessionCount)}
          subtext={`${(totals.creditsSpent / Math.max(totals.sessionCount, 1)).toFixed(1)} Credits per conversation`}
          series={usage.daily.map((day) => day.sessionCount)}
          delta={null}
        />
        <TrendCard
          icon={TextIcon}
          title="Tokens"
          accent="escalated"
          deltaTone="up-is-bad"
          info="Input plus output Tokens the Agent Model processed, for insight only — Credits are charged per use, never per Token. Older usage without Token records counts as zero."
          value={formatTokens(tokens)}
          subtext={`${Math.round(cachedShare)}% input cached`}
          series={usage.daily.map((day) => day.inputTokens + day.outputTokens)}
          delta={null}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DailyChart daily={usage.daily} />
        <StackedDailyChart
          title="Tokens"
          description="Input and output Tokens per day. Informational — Credits are charged when AI handles a message or sends a Follow-Up."
          data={usage.daily}
          formatValue={formatTokens}
          series={[
            { key: "inputTokens", label: "Input", color: "var(--primary)" },
            { key: "outputTokens", label: "Output", color: "var(--chart-2)" },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <UsageBreakdownCard
          title="AI Agent"
          emptyLabel="No AI Agent spend in this range."
          rows={usage.byAgent.map((row) => ({
            label: row.aiAgentName,
            creditsSpent: row.creditsSpent,
            tokens: tokensOf(row),
          }))}
        />
        <UsageBreakdownCard
          title="Agent Model"
          emptyLabel="No Agent Model spend in this range."
          rows={usage.byModel.map((row) => ({
            label: row.agentModel,
            creditsSpent: row.creditsSpent,
            tokens: tokensOf(row),
          }))}
        />
        <UsageBreakdownCard
          title="Channel"
          emptyLabel="No Channel recorded for spend in this range."
          rows={usage.byChannel.map((row) => ({
            label: channelLabels[row.channel],
            creditsSpent: row.creditsSpent,
            tokens: tokensOf(row),
          }))}
        />
      </div>
    </div>
  );
}

function ToolsPanel({ range, filters }: { range: DashboardRange; filters: AiUsageFilters }) {
  const toolUsage = useQuery(aiToolUsageQueryOptions(range, filters));
  if (toolUsage.isPending) return <PanelSkeleton />;
  if (toolUsage.isError) {
    return <LoadState error={toolUsage.error} onRetry={() => toolUsage.refetch()} />;
  }

  const { totals, daily, byTool } = toolUsage.data.toolUsage;
  if (totals.calls === 0) {
    return (
      <EmptyRange
        title="No Tool calls in this range"
        description="When the AI Agent calls a Tool to look something up or take an action, it shows up here."
      />
    );
  }
  const errorRate = (totals.failed / totals.calls) * 100;
  const chartData = daily.map((day) => ({
    date: day.date,
    succeeded: day.calls - day.failed,
    failed: day.failed,
  }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrendCard
          icon={WrenchIcon}
          title="Tool calls"
          accent="primary"
          deltaTone="up-is-good"
          info="Every Tool the AI Agent called in the selected range, successful or not. Tool calls spend no Credits of their own."
          value={formatCredits(totals.calls)}
          subtext={`${byTool.length} distinct Tools`}
          series={daily.map((day) => day.calls)}
          delta={null}
        />
        <TrendCard
          icon={AlertTriangleIcon}
          title="Error rate"
          accent="danger"
          deltaTone="up-is-bad"
          info="Share of Tool calls that failed. A failed lookup never lets the AI Agent guess — it escalates instead."
          value={`${errorRate.toFixed(errorRate > 0 && errorRate < 10 ? 1 : 0)}%`}
          subtext={`${totals.failed} failed calls`}
          series={daily.map((day) => day.failed)}
          delta={null}
        />
        <TrendCard
          icon={TimerIcon}
          title="Avg latency"
          accent="escalated"
          deltaTone="up-is-bad"
          info="Average time a Tool call took, from request to result."
          value={formatLatency(totals.avgLatencyMs)}
          subtext="Across all Tools"
          series={daily.map((day) => day.calls)}
          delta={null}
        />
        <TrendCard
          icon={GaugeIcon}
          title="p95 latency"
          accent="escalated"
          deltaTone="up-is-bad"
          info="95% of Tool calls finished within this time; the slowest 5% took longer."
          value={formatLatency(totals.p95LatencyMs)}
          subtext="Slowest 5% take longer"
          series={daily.map((day) => day.calls)}
          delta={null}
        />
      </div>
      <StackedDailyChart
        title="Tool calls"
        description="Successful and failed Tool calls per day."
        data={chartData}
        series={[
          { key: "succeeded", label: "Succeeded", color: "var(--primary)" },
          { key: "failed", label: "Failed", color: "var(--destructive)" },
        ]}
      />
      <ToolTable tools={byTool} />
    </div>
  );
}

const AiUsageView = () => {
  const [range, setRange] = useState<DashboardRange>(() => trailingRange(30));
  const [aiAgentId, setAiAgentId] = useState(ALL);
  const [channel, setChannel] = useState<UsageChannel | typeof ALL>(ALL);
  const [tab, setTab] = useState("overview");
  const filters: AiUsageFilters = {
    ...(aiAgentId !== ALL ? { aiAgentId } : {}),
    ...(channel !== ALL ? { channel } : {}),
  };
  // Unfiltered, so the AI Agent options never shrink to the one selected.
  const agents = useQuery(aiUsageSummaryQueryOptions(range)).data?.aiUsage.aiAgents ?? [];
  const ledger = useCreditLedgerQuery(tab === "ledger");

  return (
    <PlatformAppShell fullWidth>
      <TooltipProvider delayDuration={0}>
        <section className="grid gap-6">
          <SettingsHeader
            title="AI Usage"
            description="Credits spent, conversations handled, Tokens, and Tool calls for your AI Agents."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/workspace/billing">
                  <CoinsIcon className="size-4" />
                  Buy Credits
                </Link>
              </Button>
            }
          />

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
                <TabsTrigger value="ledger">Credit Ledger</TabsTrigger>
              </TabsList>
              {tab !== "ledger" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={aiAgentId} onValueChange={setAiAgentId}>
                    <SelectTrigger aria-label="Filter by AI Agent" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All AI Agents</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={channel}
                    onValueChange={(value) => setChannel(value as UsageChannel | typeof ALL)}
                  >
                    <SelectTrigger aria-label="Filter by Channel" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All Channels</SelectItem>
                      <SelectItem value="WEB">{channelLabels.WEB}</SelectItem>
                      <SelectItem value="WHATSAPP">{channelLabels.WHATSAPP}</SelectItem>
                    </SelectContent>
                  </Select>
                  <DateRangePicker range={range} onChange={setRange} />
                </div>
              ) : null}
            </div>

            <TabsContent value="overview">
              <OverviewPanel range={range} filters={filters} />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsPanel range={range} filters={filters} />
            </TabsContent>
            <TabsContent value="ledger">
              <LedgerTable query={ledger} />
            </TabsContent>
          </Tabs>
        </section>
      </TooltipProvider>
    </PlatformAppShell>
  );
};

export default AiUsageView;
