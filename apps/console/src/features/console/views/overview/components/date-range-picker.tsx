import { useState } from "react";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Calendar } from "@repo/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";

import { formatRangeLabel, RANGE_PRESETS, toISODate, trailingRange } from "../overview.utils";
import type { OverviewRange } from "../overview.utils";

/** Structural mirror of react-day-picker's DateRange. */
type CalendarSelection = { from?: Date; to?: Date };

export default function DateRangePicker({
  range,
  onChange,
}: {
  range: OverviewRange;
  onChange: (range: OverviewRange) => void;
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
          {RANGE_PRESETS.map((preset) => {
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
