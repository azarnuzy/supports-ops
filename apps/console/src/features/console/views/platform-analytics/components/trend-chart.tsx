import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="sessions"
              stroke="var(--color-sessions)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="ticketsCreated"
              stroke="var(--color-ticketsCreated)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
