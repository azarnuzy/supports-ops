import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import {
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
} from "../../components/console-patterns";
import DateRangePicker, {
  type ConsoleDateRange,
  trailingRange,
} from "../../components/date-range-picker";
import { sections } from "../../shell";
import {
  conditionLabel,
  conditionTone,
  operatorAtRiskQueryOptions,
} from "../at-risk/at-risk";
import { operatorOverviewQueryOptions } from "./overview.services";
import { formatCount, formatIdr, formatUsd } from "./overview.utils";

const updatedAtFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "medium" });

const AT_RISK_PREVIEW_LIMIT = 5;

const quickLinkSlugs = [
  "workspaces",
  "platform-analytics",
  "billing-credits",
  "ai-usage-economics",
  "audit-log",
];

export default function OverviewView() {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const overview = useQuery(operatorOverviewQueryOptions(range));
  const atRisk = useQuery(operatorAtRiskQueryOptions);
  const data = overview.data?.overview;
  const atRiskWorkspaces = atRisk.data?.workspaces ?? [];
  const quickLinks = sections.filter((section) => quickLinkSlugs.includes(section.slug));

  return (
    <>
      <ConsolePageHeader
        title="Overview"
        description="Read-only platform summary. Report days use UTC until a single time convention is adopted (see #250)."
        actions={
          <>
            <DateRangePicker range={range} onChange={setRange} />
            {overview.dataUpdatedAt ? (
              <span className="text-xs text-muted-foreground">
                Updated {updatedAtFormat.format(new Date(overview.dataUpdatedAt))}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => void overview.refetch()}
              disabled={overview.isFetching}
            >
              <RefreshCwIcon
                className={cn("size-3.5", overview.isFetching && "animate-spin")}
              />
              {overview.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {overview.isPending || overview.isError || !data ? (
        <ConsoleQueryState
          isPending={overview.isPending}
          isError={overview.isError}
          error={overview.error}
          errorFallback="Failed to load the overview."
          isEmpty={!overview.isPending && !overview.isError && !data}
          emptyTitle="No overview data"
          emptyDescription="Overview metrics are not available yet."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ConsoleMetricCard
            label="Workspaces (all-time, as of now)"
            value={formatCount(data.workspaces.total)}
          />
          <ConsoleMetricCard
            label="New Workspaces (selected range)"
            value={formatCount(data.workspaces.new)}
          />
          <ConsoleMetricCard label="Revenue, IDR (selected range)" value={formatIdr(data.revenueIdr)} />
          <ConsoleMetricCard
            label="Provider cost, USD (selected range)"
            value={formatUsd(data.providerCostUsd)}
          />
          <ConsoleMetricCard
            label="Credits spent (selected range)"
            value={formatCount(data.credits.spent)}
          />
          <ConsoleMetricCard
            label="Credits topped up (selected range)"
            value={formatCount(data.credits.topUps)}
          />
          <ConsoleMetricCard
            label="Trial Grant Credits (selected range)"
            value={formatCount(data.credits.trialGrants)}
          />
          <ConsoleMetricCard
            label="Sessions, Web + WhatsApp (selected range)"
            value={formatCount(Object.values(data.sessions).reduce((sum, n) => sum + n, 0))}
          />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Needs Attention</h2>
          <Link to="/needs-attention" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        {atRisk.isPending || atRisk.isError || atRiskWorkspaces.length === 0 ? (
          <ConsoleQueryState
            isPending={atRisk.isPending}
            isError={atRisk.isError}
            error={atRisk.error}
            errorFallback="Failed to load at-risk workspaces."
            isEmpty={!atRisk.isPending && !atRisk.isError && atRiskWorkspaces.length === 0}
            emptyTitle="No Workspaces need attention"
          />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {atRiskWorkspaces.slice(0, AT_RISK_PREVIEW_LIMIT).map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <Link
                    to="/workspaces/$workspaceId"
                    params={{ workspaceId: workspace.id }}
                    className="text-primary hover:underline"
                  >
                    {workspace.name}
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {workspace.conditions.map((condition) => (
                      <ConsoleStatusBadge key={condition} tone={conditionTone[condition]}>
                        {conditionLabel[condition] ?? condition}
                      </ConsoleStatusBadge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Explore further</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map(({ icon: Icon, label, slug }) => (
            <Link key={slug} to={`/${slug}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center gap-3 py-4">
                  <Icon className="size-5 text-muted-foreground" />
                  <span className="font-medium">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
