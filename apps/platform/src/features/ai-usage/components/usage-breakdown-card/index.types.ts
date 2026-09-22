export type UsageBreakdownRow = { label: string; creditsSpent: number; turnCount: number };

export type UsageBreakdownCardProps = {
  title: string;
  emptyLabel: string;
  rows: UsageBreakdownRow[];
};
