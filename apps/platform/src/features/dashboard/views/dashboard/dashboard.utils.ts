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

export type DashboardRange = { from: string; to: string };

export const RANGE_PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
] as const;

/** Inclusive local calendar date as YYYY-MM-DD. */
export function toISODate(date: Date): string {
  const localParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return localParts;
}

/** Trailing `days` calendar days ending today, inclusive. */
export function trailingRange(days: number): DashboardRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: toISODate(from), to: toISODate(to) };
}

/** "Sep 10 – Sep 16, 2026" for the range picker trigger. */
export function formatRangeLabel(range: DashboardRange): string {
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

/** Trend direction inside the selected range: the later half of the daily
 * series against the earlier half. Null when the earlier half is all zeros
 * or the range is too short to split. */
export function periodDelta(series: number[]): number | null {
  const half = Math.floor(series.length / 2);
  if (half === 0) return null;
  const previous = series.slice(0, half).reduce((sum, value) => sum + value, 0);
  const current = series.slice(series.length - half).reduce((sum, value) => sum + value, 0);
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Compact human response time: 45s, 12m, 1h 20m, 2d 4h. */
export function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** "2m ago" style age for recent-conversation rows, falling back to a short
 * date once the age leaves the day scale. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
