import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
  sessionCount: { label: "Conversations", color: "var(--chart-2)" },
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
        <CardTitle className="text-sm">Credits spent and conversations</CardTitle>
        <CardDescription className="text-xs">
          Daily Credit usage and conversations with AI activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillUsageCredits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-creditsSpent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-creditsSpent)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillUsageConversations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-sessionCount)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-sessionCount)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => fullDayLabel(payload?.[0]?.payload.date ?? "")}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="creditsSpent"
              type="monotone"
              stroke="var(--color-creditsSpent)"
              strokeWidth={2}
              fill="url(#fillUsageCredits)"
              dot={false}
            />
            <Area
              dataKey="sessionCount"
              type="monotone"
              stroke="var(--color-sessionCount)"
              strokeWidth={2}
              fill="url(#fillUsageConversations)"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
