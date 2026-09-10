import { useMemo, useState } from "react";
import { XIcon, ZapIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import { dayLabelOf, formatShare, intensityFor, summarizeBuckets } from "../../dashboard.utils";
import type { HeatmapGridProps } from "./index.types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const ZERO_CELL_CLASS = "bg-muted/50 ring-1 ring-inset ring-border/60 dark:bg-muted/30";

type Slot = { day: string; hour: number };

function hourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00 – ${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

function SlotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card px-3 py-2 shadow-sm">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function HeatmapGrid({ buckets, metricLabel }: HeatmapGridProps) {
  const summary = useMemo(() => summarizeBuckets(buckets), [buckets]);
  const [hovered, setHovered] = useState<Slot | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);

  const countAt = (slot: Slot) => summary.byDayHour.get(slot.day)?.get(slot.hour) ?? 0;
  const flatIndex = (slot: Slot) => summary.days.indexOf(slot.day) * 24 + slot.hour;
  const slotAtFlat = (index: number): Slot => ({
    day: summary.days[Math.floor(index / 24)] as string,
    hour: index % 24,
  });

  const hourLabel = (hour: number) =>
    hour % 2 === 0 || hovered?.hour === hour || selected?.hour === hour
      ? String(hour).padStart(2, "0")
      : "";

  const cellInsightLines = (slot: Slot, count: number) => {
    const lines: string[] = [];
    if (count === 0) {
      lines.push("No Tickets in this hour");
      return lines;
    }
    const index = flatIndex(slot);
    if (index > 0) {
      const delta = count - countAt(slotAtFlat(index - 1));
      if (delta > 0) lines.push(`+${delta} vs the previous hour`);
      if (delta < 0) lines.push(`${delta} vs the previous hour`);
    }
    return lines;
  };

  const dayTotal = (day: string) => HOURS.reduce((sum, hour) => sum + countAt({ day, hour }), 0);

  const selectedSlot = selected
    ? (() => {
        const count = countAt(selected);
        const index = flatIndex(selected);
        const prevCount = index > 0 ? countAt(slotAtFlat(index - 1)) : null;
        const delta = prevCount === null ? null : count - prevCount;
        return {
          count,
          dayShare: formatShare(count, dayTotal(selected.day)),
          weekShare: formatShare(count, summary.total),
          delta:
            delta === null ? "—" : delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "No change",
        };
      })()
    : null;

  return (
    <div role="group" aria-label={`${metricLabel} heatmap`} onMouseLeave={() => setHovered(null)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <ZapIcon className="size-3" />
          {summary.peak
            ? `Peak — ${dayLabelOf(summary.peak.day).weekdayShort} ${String(summary.peak.hour).padStart(2, "0")}:00 · ${summary.peak.count}`
            : "No activity yet"}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {summary.total} {summary.total === 1 ? "Ticket" : "Tickets"} this week
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-max gap-y-1">
          <div className="flex items-center gap-2">
            <div className="w-24 shrink-0" />
            <div className="flex gap-1">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className={cn(
                    "w-6 text-center text-[9px] tabular-nums transition-colors duration-150",
                    hovered?.hour === hour
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {hourLabel(hour)}
                </div>
              ))}
            </div>
          </div>

          {summary.days.map((day) => {
            const label = dayLabelOf(day);
            const isRowHovered = hovered?.day === day;
            return (
              <div
                key={day}
                className={cn(
                  "flex items-center gap-2 rounded-lg transition-colors duration-150",
                  isRowHovered && "bg-muted/40",
                )}
              >
                <div
                  className={cn(
                    "sticky left-0 z-10 w-24 shrink-0 rounded-md px-2 py-0.5 text-right",
                    isRowHovered ? "bg-muted" : "bg-card",
                  )}
                >
                  <p
                    className={cn(
                      "text-xs leading-tight",
                      isRowHovered ? "font-semibold text-foreground" : "font-medium",
                    )}
                  >
                    {label.weekday}
                  </p>
                  <p className="text-[10px] leading-tight text-muted-foreground">{label.date}</p>
                </div>
                <div className="flex gap-1 py-0.5">
                  {HOURS.map((hour) => {
                    const slot = { day, hour };
                    const count = countAt(slot);
                    const isSelected = selected?.day === day && selected.hour === hour;
                    const isColumnHint =
                      hovered !== null && hovered.hour === hour && hovered.day !== day;
                    const isPeak = count > 0 && summary.peak !== null && count === summary.max;
                    return (
                      <Tooltip key={hour}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${label.full}, ${hourRange(hour)} UTC, ${count} ${count === 1 ? "Ticket" : "Tickets"}`}
                            aria-pressed={isSelected}
                            onMouseEnter={() => setHovered(slot)}
                            onFocus={() => setHovered(slot)}
                            onClick={() => setSelected(isSelected ? null : slot)}
                            className={cn(
                              "size-6 rounded-md outline-none transition-all duration-150 ease-out",
                              count === 0 ? ZERO_CELL_CLASS : intensityFor(count, summary.max),
                              "hover:z-20 hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-primary/70",
                              "focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring",
                              isPeak && !isSelected && "ring-1 ring-inset ring-primary/40",
                              isColumnHint && "ring-1 ring-inset ring-primary/25",
                              isSelected &&
                                "z-10 scale-105 ring-2 ring-primary ring-offset-2 ring-offset-card",
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="w-52 rounded-lg border bg-popover p-3 text-left text-popover-foreground shadow-lg"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {metricLabel}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {label.full} · {hourRange(hour)} UTC
                          </p>
                          <p className="mt-1.5 text-lg font-semibold leading-none tabular-nums">
                            {count}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              {count === 1 ? "Ticket" : "Tickets"}
                            </span>
                          </p>
                          <ul className="mt-1.5 grid gap-0.5">
                            {cellInsightLines(slot, count).map((line) => (
                              <li
                                key={line}
                                className="flex items-start gap-1.5 text-xs text-muted-foreground"
                              >
                                <span aria-hidden className="mt-px text-primary">
                                  •
                                </span>
                                {line}
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Less</span>
          {[ZERO_CELL_CLASS, "bg-primary/20", "bg-primary/45", "bg-primary/75", "bg-primary"].map(
            (cellClass) => (
              <span key={cellClass} className={cn("size-3.5 rounded-[3px]", cellClass)} />
            ),
          )}
          <span>More</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          One cell per hour, UTC. Hover for details, click to inspect a slot.
        </p>
      </div>

      {selected && selectedSlot ? (
        <div className="mt-4 animate-in rounded-xl border bg-muted/40 p-4 duration-200 fade-in-0 slide-in-from-top-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {metricLabel} · selected slot
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {dayLabelOf(selected.day).full}, {hourRange(selected.hour)} UTC
              </p>
            </div>
            <button
              type="button"
              aria-label="Clear slot selection"
              onClick={() => setSelected(null)}
              className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SlotStat label="Tickets this hour" value={`${selectedSlot.count}`} />
            <SlotStat label="Share of this day" value={selectedSlot.dayShare} />
            <SlotStat label="Share of this week" value={selectedSlot.weekShare} />
            <SlotStat label="vs previous hour" value={selectedSlot.delta} />
          </dl>
        </div>
      ) : null}
    </div>
  );
}
