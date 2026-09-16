import { useId } from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon } from "lucide-react";
import { Area, AreaChart } from "recharts";

import { CardAction, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ChartContainer, type ChartConfig } from "@repo/ui/components/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import DashboardCard from "../dashboard-card";
import type { TrendCardAccent, TrendCardProps } from "./index.types";

const accentStyles: Record<TrendCardAccent, { chip: string; stroke: string }> = {
  primary: { chip: "bg-primary/10 text-primary", stroke: "var(--primary)" },
  resolved: {
    chip: "bg-status-resolved/10 text-[var(--status-resolved-foreground)]",
    stroke: "var(--status-resolved)",
  },
  escalated: {
    chip: "bg-status-escalated/10 text-[var(--status-escalated-foreground)]",
    stroke: "var(--status-escalated)",
  },
  danger: { chip: "bg-destructive/10 text-destructive", stroke: "var(--destructive)" },
};

const GOOD_CLASS = "text-status-resolved";
const BAD_CLASS = "text-destructive";

function TrendSparkline({ series, stroke }: { series: number[]; stroke: string }) {
  const gradientId = useId();
  const data = series.map((value, index) => ({ index, value }));
  const config = { value: { color: stroke } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="mb-0.5 h-12 w-28 shrink-0">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke={stroke}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function DeltaRow({ delta, tone }: { delta: number | null; tone: TrendCardProps["deltaTone"] }) {
  if (delta === null) {
    return <span className="text-[11px] whitespace-nowrap text-muted-foreground">vs previous period</span>;
  }
  const magnitude = Math.round(Math.abs(delta));
  const up = delta > 0;
  const good = tone === "up-is-good" ? up : !up;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px]">
      {magnitude === 0 ? null : up ? (
        <ArrowUpRightIcon className={cn("size-3", good ? GOOD_CLASS : BAD_CLASS)} />
      ) : (
        <ArrowDownRightIcon className={cn("size-3", good ? GOOD_CLASS : BAD_CLASS)} />
      )}
      <span className={cn("font-medium tabular-nums", good ? GOOD_CLASS : BAD_CLASS)}>
        {magnitude === 0 ? "±0%" : `${up ? "+" : "-"}${magnitude}%`}
      </span>
      <span className="text-muted-foreground">vs previous period</span>
    </span>
  );
}

export default function TrendCard({
  icon: Icon,
  title,
  info,
  value,
  subtext,
  series,
  delta,
  deltaTone,
  accent,
}: TrendCardProps) {
  const styles = accentStyles[accent];
  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="flex items-center gap-2 text-xs leading-4 font-medium">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-lg",
              styles.chip,
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="truncate">{title}</span>
        </CardTitle>
        <CardAction>
          <Tooltip>
            <TooltipTrigger className="cursor-help">
              <InfoIcon className="size-3.5 text-muted-foreground/60" />
              <span className="sr-only">About {title}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{info}</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{subtext}</div>
            <div className="mt-1.5">
              <DeltaRow delta={delta} tone={deltaTone} />
            </div>
          </div>
          <TrendSparkline series={series} stroke={styles.stroke} />
        </div>
      </CardContent>
    </DashboardCard>
  );
}
