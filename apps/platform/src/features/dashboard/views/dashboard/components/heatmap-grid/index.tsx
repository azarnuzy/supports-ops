import { cn } from "@repo/ui/lib/utils";
import type { HeatmapGridProps } from "./index.types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function intensityClass(count: number, max: number) {
  if (count === 0 || max === 0) return "bg-muted";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/70";
  if (ratio > 0.25) return "bg-primary/40";
  return "bg-primary/20";
}

function dayLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    date: date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }),
  };
}

export default function HeatmapGrid({ buckets }: HeatmapGridProps) {
  const days = new Map<string, Map<number, number>>();
  for (const bucket of buckets) {
    const date = new Date(bucket.hourStart);
    const day = date.toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, new Map());
    days.get(day)!.set(date.getUTCHours(), bucket.count);
  }
  const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(0, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-y-1">
        {rows.map(([day, hourCounts]) => {
          const label = dayLabel(day);
          return (
            <div key={day} className="flex items-center gap-2">
              <div className="w-24 shrink-0 text-right leading-tight">
                <p className="text-xs font-medium">{label.weekday}</p>
                <p className="text-[11px] text-muted-foreground">{label.date}</p>
              </div>
              <div className="flex gap-1">
                {HOURS.map((hour) => {
                  const count = hourCounts.get(hour) ?? 0;
                  return (
                    <div
                      key={hour}
                      className={cn("size-4 rounded-sm", intensityClass(count, max))}
                      title={`${String(hour).padStart(2, "0")}:00 — ${count}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <div className="w-24 shrink-0" />
          <div className="flex gap-1">
            {HOURS.map((hour) => (
              <div key={hour} className="w-4 text-center text-[9px] text-muted-foreground">
                {String(hour).padStart(2, "0")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
