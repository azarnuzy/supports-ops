import type { LucideIcon } from "lucide-react";

export type TrendCardAccent = "primary" | "resolved" | "escalated" | "danger";

export type TrendCardProps = {
  icon: LucideIcon;
  title: string;
  /** Full metric explanation, shown in the info tooltip. */
  info: string;
  /** Preformatted headline figure. */
  value: string;
  /** One-line context under the figure. */
  subtext: string;
  /** Daily counts for the last 7 days, oldest first. */
  series: number[];
  /** Percent change vs the previous 7 days; null when the baseline is 0. */
  delta: number | null;
  /** Whether an increase reads as good or bad news for this metric. */
  deltaTone: "up-is-good" | "up-is-bad";
  accent: TrendCardAccent;
};
