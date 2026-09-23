import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import BreakdownChart from "../overview/components/breakdown-chart";
import DateRangePicker from "../overview/components/date-range-picker";
import { formatCount, formatUsd, trailingRange } from "../overview/overview.utils";
import type { OverviewRange } from "../overview/overview.utils";
import { operatorMarginQueryOptions } from "./margin.services";

const usdPerCreditFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
});

export default function MarginView() {
  const [range, setRange] = useState<OverviewRange>(() => trailingRange(7));
  const margin = useQuery(operatorMarginQueryOptions(range));
  const models = margin.data?.models ?? [];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Model margin</h1>
        <DateRangePicker range={range} onChange={setRange} />
      </div>

      {margin.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading margin…</p>
      ) : margin.isError ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Model margin unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-destructive">
                {margin.error instanceof Error ? margin.error.message : "Failed to load the Model margin."}
              </p>
              <Button size="sm" variant="outline" onClick={() => margin.refetch()}>
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : models.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No AI Turns in this range.</p>
      ) : (
        <>
          <Card className="mt-6">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent Model</TableHead>
                    <TableHead className="text-right">AI Turns</TableHead>
                    <TableHead className="text-right">Unlimited Turns</TableHead>
                    <TableHead className="text-right">Credits charged</TableHead>
                    <TableHead className="text-right">Provider cost</TableHead>
                    <TableHead className="text-right">USD / Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => (
                    <TableRow key={model.agentModel}>
                      <TableCell className="font-medium">{model.agentModel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(model.aiTurns)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(model.unlimitedTurns)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(model.creditsCharged)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(model.providerCostUsd)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {model.usdPerCredit === null ? "—" : usdPerCreditFormat.format(model.usdPerCredit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title="AI Turns per Agent Model"
              data={models.map((model) => ({ label: model.agentModel, value: model.aiTurns }))}
            />
            <BreakdownChart
              title="Provider cost (USD) per Agent Model"
              data={models.map((model) => ({ label: model.agentModel, value: model.providerCostUsd }))}
            />
          </div>
        </>
      )}
    </main>
  );
}
