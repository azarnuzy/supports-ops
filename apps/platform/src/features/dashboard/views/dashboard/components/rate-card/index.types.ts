import type { ResolutionFigure } from "@repo/api-client";

export type RateCardProps = {
  title: string;
  description: string;
  figure: ResolutionFigure;
  totalTickets: number;
};
