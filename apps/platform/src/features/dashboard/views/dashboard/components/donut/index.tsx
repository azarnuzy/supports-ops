import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart";
import { cn } from "@repo/ui/lib/utils";

import { formatShare } from "../../dashboard.utils";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  /** Any CSS color; theme variables keep slices in sync with the design tokens. */
  color: string;
};

type DonutProps = {
  slices: DonutSlice[];
  /** Unit under the total in the hole, e.g. "Tickets". */
  unitLabel?: string;
  className?: string;
};

/** Donut with the total in the hole and a dot-label-count-share legend,
 * matching the dashboard reference layout. */
export default function Donut({ slices, unitLabel = "Tickets", className }: DonutProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const config: ChartConfig = Object.fromEntries(
    slices.map((slice) => [slice.key, { label: slice.label, color: slice.color }]),
  );

  return (
    <div className={cn("flex h-full min-w-0 flex-1 items-center gap-4", className)}>
      <div className="relative aspect-square size-24 shrink-0 sm:size-32">
        <ChartContainer config={config} className="aspect-auto size-full">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="key"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={4}
              strokeWidth={0}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={`var(--color-${slice.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums tracking-tight">{total}</span>
          <span className="text-[11px] text-muted-foreground">{unitLabel}</span>
        </div>
      </div>
      <ul className="grid min-w-0 flex-1 content-center gap-2">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-xs">{slice.label}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums">{slice.value}</span>
            <span className="hidden w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
              {formatShare(slice.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
