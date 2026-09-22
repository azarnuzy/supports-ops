import { useQuery } from "@tanstack/react-query";
import { CoinsIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PlatformAppShell } from "../app-shell";
import { DateRangePicker } from "../dashboard/views/dashboard/components";
import { trailingRange } from "../dashboard/views/dashboard/dashboard.utils";
import type { DashboardRange } from "../dashboard/views/dashboard/dashboard.utils";
import { SettingsHeader } from "../settings/components/settings-header";
import { aiUsageSummaryQueryOptions, useCreditLedgerQuery } from "./ai-usage.hooks";
import { formatCredits, lowBalanceThreshold } from "./ai-usage.utils";
import { DailyChart, LedgerTable, UsageBreakdownCard } from "./components";

const AiUsageView = () => {
  const [range, setRange] = useState<DashboardRange>(() => trailingRange(30));
  const summary = useQuery(aiUsageSummaryQueryOptions(range));
  const ledger = useCreditLedgerQuery(true);
  const usage = summary.data?.aiUsage;
  const hasAnyUsage = usage ? usage.daily.some((point) => point.turnCount > 0) : false;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="AI Usage"
          description="Balance, spend, and Credit Ledger for this Workspace's AI Agents."
          action={<DateRangePicker range={range} onChange={setRange} />}
        />

        {summary.isPending ? (
          <div className="grid gap-4">
            <Skeleton className="h-24 w-full rounded-xl sm:w-64" />
            <Skeleton className="h-64 w-full rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 w-full rounded-xl" />
              <Skeleton className="h-56 w-full rounded-xl" />
            </div>
          </div>
        ) : null}

        {summary.isError ? (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-destructive">
              {summary.error instanceof Error ? summary.error.message : "Unable to load AI Usage."}
            </p>
            <Button size="sm" variant="outline" onClick={() => void summary.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {usage ? (
          <>
            <Card className="w-fit min-w-64">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CoinsIcon className="size-4 text-muted-foreground" />
                  Balance
                </CardTitle>
                <CardDescription className="text-xs">Across all AI Agents.</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className={
                    usage.balance < lowBalanceThreshold
                      ? "text-3xl font-semibold tabular-nums text-destructive"
                      : "text-3xl font-semibold tabular-nums"
                  }
                >
                  {formatCredits(usage.balance)}
                </p>
                {usage.balance < lowBalanceThreshold ? (
                  <p className="mt-1 text-xs text-destructive">
                    Below {lowBalanceThreshold} Credits — Top-Up soon to avoid Credit Exhaustion.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {hasAnyUsage ? (
              <>
                <DailyChart daily={usage.daily} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <UsageBreakdownCard
                    title="By AI Agent"
                    emptyLabel="No AI Agent spend in this range."
                    rows={usage.byAgent.map((row) => ({
                      label: row.aiAgentName,
                      creditsSpent: row.creditsSpent,
                      turnCount: row.turnCount,
                    }))}
                  />
                  <UsageBreakdownCard
                    title="By Agent Model"
                    emptyLabel="No Agent Model spend in this range."
                    rows={usage.byModel.map((row) => ({
                      label: row.agentModel,
                      creditsSpent: row.creditsSpent,
                      turnCount: row.turnCount,
                    }))}
                  />
                </div>
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">No AI Usage yet in this range</CardTitle>
                  <CardDescription className="text-xs">
                    Once your AI Agent replies to a Customer, Credits spent and AI Turns will show
                    up here.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            <LedgerTable query={ledger} />
          </>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default AiUsageView;
