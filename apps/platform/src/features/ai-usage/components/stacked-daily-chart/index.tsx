import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart";

import { dayLabelOf } from "../../../dashboard/views/dashboard/dashboard.utils";
import type { StackedDailyChartProps } from "./index.types";

function fullDayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function StackedDailyChart({
  title,
  description,
  data,
  series,
  formatValue = (value) => String(value),
}: StackedDailyChartProps) {
  const config = useMemo(
    () =>
      Object.fromEntries(
        series.map((item) => [item.key, { label: item.label, color: item.color }]),
      ) satisfies ChartConfig,
    [series],
  );
  const rows = useMemo(
    () => data.map((point) => ({ ...point, label: dayLabelOf(point.date).date })),
    [data],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              width={40}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatValue(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => fullDayLabel(payload?.[0]?.payload.date ?? "")}
                  formatter={(value, name, item) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2 rounded-[2px]" style={{ background: item.color }} />
                        {config[String(name)]?.label ?? name}
                      </span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatValue(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId="day"
                fill={`var(--color-${item.key})`}
                stroke="var(--card)"
                strokeWidth={1}
                radius={index === series.length - 1 ? [3, 3, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
