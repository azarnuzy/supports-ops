export type OverviewRange = { from: string; to: string };

export const RANGE_PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
] as const;

/** Inclusive local calendar date as YYYY-MM-DD. */
export function toISODate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Trailing `days` calendar days ending today, inclusive. */
export function trailingRange(days: number): OverviewRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: toISODate(from), to: toISODate(to) };
}

/** "Sep 10 – Sep 16, 2026" for the range picker trigger. */
export function formatRangeLabel(range: OverviewRange): string {
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

const idrFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const formatIdr = (value: number) => idrFormat.format(value);

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
export const formatUsd = (value: number) => usdFormat.format(value);

export const formatCount = (value: number) => value.toLocaleString();
