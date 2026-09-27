import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/components/chart";
import type { ChartConfig } from "@repo/ui/components/chart";

/** Sessions are counted from Session rows, Tickets created from Ticket rows
 * — two different entities plotted side by side, never summed together. */
export default function TrendChart({
  data,
}: {
  data: { date: string; sessions: number; ticketsCreated: number }[];
}) {
  const config = {
    sessions: { label: "Sessions", color: "var(--chart-1)" },
    ticketsCreated: { label: "Tickets created", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Sessions and Tickets created per day</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-72 w-full">
          <AreaChart data={data} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="fillAnalyticsSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-sessions)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-sessions)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillAnalyticsTickets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ticketsCreated)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-ticketsCreated)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="var(--color-sessions)"
              strokeWidth={2}
              fill="url(#fillAnalyticsSessions)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="ticketsCreated"
              stroke="var(--color-ticketsCreated)"
              strokeWidth={2}
              fill="url(#fillAnalyticsTickets)"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
