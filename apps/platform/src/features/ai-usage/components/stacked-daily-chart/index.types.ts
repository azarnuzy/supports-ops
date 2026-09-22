export type StackedSeries = { key: string; label: string; color: string };

export type StackedDailyChartProps = {
  title: string;
  description: string;
  /** One row per day, oldest first; each series key holds that day's value. */
  data: ({ date: string } & Record<string, number | string>)[];
  /** Bottom segment first. */
  series: StackedSeries[];
  formatValue?: (value: number) => string;
};
