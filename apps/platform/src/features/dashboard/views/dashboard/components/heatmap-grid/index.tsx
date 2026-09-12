import { useMemo, useState } from "react";
import { XIcon, ZapIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import { dayLabelOf, formatShare, intensityFor, summarizeBuckets } from "../../dashboard.utils";
import type { HeatmapGridProps } from "./index.types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HEATMAP_GRID_STYLE = {
  gridTemplateColumns: "5.5rem repeat(24, minmax(1.125rem, 1fr))",
};
const ZERO_CELL_CLASS = "bg-muted/50 ring-1 ring-inset ring-border/60 dark:bg-muted/30";

type Slot = { day: string; hour: number };

function hourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

function SlotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function HeatmapGrid({ buckets, metricLabel, timeZone }: HeatmapGridProps) {
  const summary = useMemo(() => summarizeBuckets(buckets, timeZone), [buckets, timeZone]);
  const [selected, setSelected] = useState<Slot | null>(null);

  const countAt = (slot: Slot) => summary.byDayHour.get(slot.day)?.get(slot.hour) ?? 0;
  const flatIndex = (slot: Slot) => summary.days.indexOf(slot.day) * 24 + slot.hour;
  const slotAtFlat = (index: number): Slot => ({
    day: summary.days[Math.floor(index / 24)] as string,
    hour: index % 24,
  });
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
    <div role="group" aria-label={`${metricLabel} heatmap`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <ZapIcon className="size-3.5" />
          {summary.peak
            ? `Peak · ${dayLabelOf(summary.peak.day).weekdayShort} ${String(summary.peak.hour).padStart(2, "0")}:00 · ${summary.peak.count} ${summary.peak.count === 1 ? "Ticket" : "Tickets"}`
            : "No activity yet"}
        </span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          Weekly total · {summary.total} {summary.total === 1 ? "Ticket" : "Tickets"}
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[48rem] gap-y-1.5">
          <div className="grid items-end gap-1" style={HEATMAP_GRID_STYLE}>
            <div className="pr-2 text-right text-xs font-medium text-muted-foreground">Hour</div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-center text-[10px] tabular-nums text-muted-foreground"
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {summary.days.map((day) => {
            const label = dayLabelOf(day);
            return (
              <div key={day} className="grid items-center gap-1" style={HEATMAP_GRID_STYLE}>
                <div className="sticky left-0 z-10 bg-card pr-2 text-right">
                  <p className="text-xs font-medium leading-4">{label.weekdayShort}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{label.date}</p>
                </div>
                {HOURS.map((hour) => {
                  const slot = { day, hour };
                  const count = countAt(slot);
                  const isSelected = selected?.day === day && selected.hour === hour;
                  const isPeak = summary.peak?.day === day && summary.peak.hour === hour;
                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${metricLabel}: ${label.full}, ${hourRange(hour)} ${timeZone}, ${count} ${count === 1 ? "Ticket" : "Tickets"}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelected(isSelected ? null : slot)}
                          className={cn(
                            "aspect-square w-full cursor-pointer rounded-md outline-none transition-[transform,box-shadow,background-color] duration-100 ease-out motion-reduce:transition-none",
                            count === 0 ? ZERO_CELL_CLASS : intensityFor(count, summary.max),
                            "hover:z-20 hover:scale-105 hover:shadow-sm hover:ring-2 hover:ring-primary/70",
                            "focus-visible:z-20 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                            isPeak && !isSelected && "ring-1 ring-inset ring-primary/60",
                            isSelected &&
                              "z-10 scale-105 ring-2 ring-primary ring-offset-2 ring-offset-card",
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={6}
                        className="pointer-events-none w-56 rounded-lg border bg-popover p-3 text-left text-popover-foreground shadow-lg duration-75 data-[state=closed]:animate-none [&>svg]:bg-popover [&>svg]:fill-popover"
                      >
                        <p className="text-xs font-semibold">{metricLabel}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {label.full} · {hourRange(hour)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{timeZone}</p>
                        <p className="mt-2 text-xl font-semibold leading-none tabular-nums">
                          {count}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {count === 1 ? "Ticket" : "Tickets"}
                          </span>
                        </p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {count === 0
                            ? "No Tickets in this hour"
                            : `${formatShare(count, summary.total)} of the weekly total`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 text-xs text-muted-foreground">
        <div
          className="flex items-center gap-1.5"
          aria-label="Heatmap intensity from less to more"
          role="group"
        >
          <span>Less</span>
          {[ZERO_CELL_CLASS, "bg-primary/20", "bg-primary/45", "bg-primary/75", "bg-primary"].map(
            (cellClass) => (
              <span aria-hidden key={cellClass} className={cn("size-3.5 rounded", cellClass)} />
            ),
          )}
          <span>More</span>
        </div>
        <p>Hourly · {timeZone} · Hover or focus for details</p>
      </div>

      {selected && selectedSlot ? (
        <div className="mt-5 animate-in rounded-xl border bg-muted/40 p-4 duration-200 fade-in-0 slide-in-from-top-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Selected hour</p>
              <p className="mt-0.5 text-sm font-semibold">
                {dayLabelOf(selected.day).full}, {hourRange(selected.hour)} · {timeZone}
              </p>
            </div>
            <button
              type="button"
              aria-label="Clear hour selection"
              onClick={() => setSelected(null)}
              className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SlotStat label={metricLabel} value={`${selectedSlot.count}`} />
            <SlotStat label="Share of day" value={selectedSlot.dayShare} />
            <SlotStat label="Share of week" value={selectedSlot.weekShare} />
            <SlotStat label="From previous hour" value={selectedSlot.delta} />
          </dl>
        </div>
      ) : null}
    </div>
  );
}
