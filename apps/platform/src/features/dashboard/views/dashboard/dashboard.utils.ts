import type { AnalyticsHourBucket } from "@repo/api-client";

export const channelTypeLabels: Record<string, string> = { WEB: "Web", WHATSAPP: "WhatsApp" };

const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatRate(rate: number | null) {
  return rate === null ? "—" : percentFormat.format(rate);
}

export function formatShare(part: number, whole: number) {
  return whole === 0 ? "—" : percentFormat.format(part / whole);
}

export type TrafficSummary = {
  days: string[];
  byDayHour: Map<string, Map<number, number>>;
  max: number;
  total: number;
  peak: { day: string; hour: number; count: number } | null;
};

export function summarizeBuckets(buckets: AnalyticsHourBucket[], timeZone: string): TrafficSummary {
  const byDayHour = new Map<string, Map<number, number>>();
  const localParts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  let total = 0;
  let max = 0;
  let peak: TrafficSummary["peak"] = null;
  for (const bucket of buckets) {
    const date = new Date(bucket.hourStart);
    const parts = Object.fromEntries(
      localParts.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour);
    let byHour = byDayHour.get(day);
    if (!byHour) {
      byHour = new Map();
      byDayHour.set(day, byHour);
    }
    const count = (byHour.get(hour) ?? 0) + bucket.count;
    byHour.set(hour, count);
    total += bucket.count;
    if (count > max) {
      max = count;
      peak = { day, hour, count };
    }
  }
  const days = [...byDayHour.keys()].sort((a, b) => a.localeCompare(b));
  return {
    days,
    byDayHour,
    max,
    total,
    peak,
  };
}

export function intensityFor(count: number, max: number) {
  if (max === 0 || count <= 0) return "bg-muted dark:bg-muted/50";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/75";
  if (ratio > 0.25) return "bg-primary/45";
  return "bg-primary/20";
}

export function dayLabelOf(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" }),
    weekdayShort: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
    date: date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    full: date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}
