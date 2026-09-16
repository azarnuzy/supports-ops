import { z } from "zod";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest span one analytics request may cover, counted inclusively: a
 * 92-day window has 91 full days between its ends. */
const MAX_INCLUSIVE_DAYS = 92;

function utcMilliseconds(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

/** `YYYY-MM-DD` naming a real UTC calendar date — `2026-02-30` is rejected
 * rather than silently rolled to March. */
const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(utcMilliseconds(value));
    return (
      date.getUTCFullYear() === Number(value.slice(0, 4)) &&
      date.getUTCMonth() === Number(value.slice(5, 7)) - 1 &&
      date.getUTCDate() === Number(value.slice(8, 10))
    );
  });

export const analyticsRangeQuerySchema = z
  .object({ from: utcDate.optional(), to: utcDate.optional() })
  .refine((range) => (range.from === undefined) === (range.to === undefined))
  .refine((range) => {
    if (range.from === undefined || range.to === undefined) return true;
    const inclusiveDays = (utcMilliseconds(range.to) - utcMilliseconds(range.from)) / DAY_MS + 1;
    return inclusiveDays >= 1 && inclusiveDays <= MAX_INCLUSIVE_DAYS;
  });

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
