import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import BreakdownChart from "../overview/components/breakdown-chart";
import { formatCount, formatUsd } from "../overview/overview.utils";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
} from "../../components/console-patterns";
import DateRangePicker, {
  type ConsoleDateRange,
  trailingRange,
} from "../../components/date-range-picker";
import { operatorMarginQueryOptions } from "./margin.services";

const usdPerCreditFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
});

export default function MarginView() {
  const [range, setRange] = useState<ConsoleDateRange>(() => trailingRange(7));
  const margin = useQuery(operatorMarginQueryOptions(range));
  const models = margin.data?.models ?? [];

  return (
    <>
      <ConsolePageHeader
        title="AI Usage & Economics"
        description="Credits charged and provider costs by Agent Model."
        actions={<DateRangePicker range={range} onChange={setRange} />}
      />

      {margin.isPending || margin.isError || models.length === 0 ? (
        <ConsoleQueryState
          isPending={margin.isPending}
          isError={margin.isError}
          error={margin.error}
          errorFallback="Failed to load the Model margin."
          isEmpty={!margin.isPending && !margin.isError && models.length === 0}
          emptyTitle="No AI usage in this date range"
          onRetry={() => void margin.refetch()}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            AI Turn vs. Follow-Up split: not implemented — requires new business logic/data
            marker. Spend entries below count all SPEND ledger rows regardless of turn type.
          </p>

          <ConsoleDataTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Model</TableHead>
                  <TableHead className="text-right">Spend entries</TableHead>
                  <TableHead className="text-right">Unlimited spend entries</TableHead>
                  <TableHead className="text-right">Credits charged</TableHead>
                  <TableHead className="text-right">Provider cost</TableHead>
                  <TableHead className="text-right">USD / Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.agentModel}>
                    <TableCell className="font-medium">{model.agentModel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(model.aiTurns)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(model.unlimitedTurns)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(model.creditsCharged)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(model.providerCostUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {model.usdPerCredit === null
                        ? "—"
                        : usdPerCreditFormat.format(model.usdPerCredit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ConsoleDataTable>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title="Spend entries per Agent Model"
              data={models.map((model) => ({ label: model.agentModel, value: model.aiTurns }))}
            />
            <BreakdownChart
              title="Provider cost (USD) per Agent Model"
              data={models.map((model) => ({
                label: model.agentModel,
                value: model.providerCostUsd,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
