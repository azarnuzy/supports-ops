import type { LucideIcon } from "lucide-react";

import type { ResolutionFigure } from "@repo/api-client";

export type RateCardProps = {
  icon: LucideIcon;
  title: string;
  /** Full metric explanation, shown in the info tooltip. */
  info: string;
  /** One-line visible summary under the denominator. */
  hint: string;
  figure: ResolutionFigure;
  totalTickets: number;
};
