import { useState } from "react";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Calendar } from "@repo/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";

export type ConsoleDateRange = { from: string; to: string };

const rangePresets = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 23, label: "Last 23 days" },
  { days: 30, label: "Last 30 days" },
] as const;

/** Inclusive local calendar date as YYYY-MM-DD. */
function toISODate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Trailing `days` calendar days ending today, inclusive. */
export function trailingRange(days: number): ConsoleDateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: toISODate(from), to: toISODate(to) };
}

function formatRangeLabel(range: ConsoleDateRange): string {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const dayFormat = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (range.from === range.to) return dayFormat.format(to);
  const yearFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });
  return `${dayFormat.format(from)} – ${dayFormat.format(to)}, ${yearFormat.format(to)}`;
}

/** Structural mirror of react-day-picker's DateRange. */
type CalendarSelection = { from?: Date; to?: Date };

export default function DateRangePicker({
  range,
  onChange,
}: {
  range: ConsoleDateRange;
  onChange: (range: ConsoleDateRange) => void;
}) {
  const [open, setOpen] = useState(false);

  function selectPreset(days: number) {
    onChange(trailingRange(days));
    setOpen(false);
  }

  function selectCalendar(selection: unknown) {
    const selection_ = selection as CalendarSelection | undefined;
    if (selection_?.from && selection_?.to) {
      onChange({ from: toISODate(selection_.from), to: toISODate(selection_.to) });
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {formatRangeLabel(range)}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex items-center gap-1 pb-2">
          {rangePresets.map((preset) => {
            const presetRange = trailingRange(preset.days);
            const active = presetRange.from === range.from && presetRange.to === range.to;
            return (
              <Button
                key={preset.days}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => selectPreset(preset.days)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={{
            from: new Date(`${range.from}T00:00:00`),
            to: new Date(`${range.to}T00:00:00`),
          }}
          onSelect={selectCalendar}
          disabled={{ after: new Date() }}
          defaultMonth={new Date(`${range.to}T00:00:00`)}
        />
      </PopoverContent>
    </Popover>
  );
}
