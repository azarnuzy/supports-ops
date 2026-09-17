import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart";

import { dayLabelOf } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { TrafficTrendCardProps } from "./index.types";

const config = {
  created: { label: "Tickets created", color: "var(--primary)" },
} satisfies ChartConfig;

function fullDayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function TrafficTrendCard({ trends }: TrafficTrendCardProps) {
  const data = useMemo(
    () =>
      trends.map((trend) => ({
        ...trend,
        label: dayLabelOf(trend.date).date,
      })),
    [trends],
  );
  const total = useMemo(() => trends.reduce((sum, trend) => sum + trend.created, 0), [trends]);

  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="text-sm leading-4">Conversation Traffic</CardTitle>
        <CardDescription className="text-xs leading-4">Tickets created over time.</CardDescription>
        <CardAction>
          <span className="text-xs tabular-nums text-muted-foreground">{total} Tickets</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 items-center px-3.5">
        <ChartContainer config={config} className="h-44 min-w-0 w-full">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-created)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-created)" stopOpacity={0.02} />
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
              width={28}
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
                  formatter={(value) => `${value} Tickets`}
                />
              }
            />
            <Area
              dataKey="created"
              type="monotone"
              stroke="var(--color-created)"
              strokeWidth={1.75}
              fill="url(#fillCreated)"
              dot={{
                r: 2.5,
                fill: "var(--background)",
                stroke: "var(--color-created)",
                strokeWidth: 1.5,
              }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </DashboardCard>
  );
}
