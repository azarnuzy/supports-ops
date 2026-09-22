import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

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
import type { DailyChartProps } from "./index.types";

const config = {
  creditsSpent: { label: "Credits spent", color: "var(--primary)" },
  turnCount: { label: "AI Turns", color: "var(--chart-2)" },
} satisfies ChartConfig;

function fullDayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function DailyChart({ daily }: DailyChartProps) {
  const data = useMemo(
    () => daily.map((point) => ({ ...point, label: dayLabelOf(point.date).date })),
    [daily],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Credits spent and AI Turns</CardTitle>
        <CardDescription className="text-xs">Per day over the selected range.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              width={32}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => fullDayLabel(payload?.[0]?.payload.date ?? "")}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="creditsSpent" fill="var(--color-creditsSpent)" radius={[3, 3, 0, 0]} />
            <Line
              dataKey="turnCount"
              type="monotone"
              stroke="var(--color-turnCount)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
