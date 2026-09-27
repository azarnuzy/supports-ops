export type UsageBreakdownRow = {
  label: string;
  creditsSpent: number;
  /** Input plus output Tokens. */
  tokens: number;
};

export type UsageBreakdownCardProps = {
  title: string;
  emptyLabel: string;
  rows: UsageBreakdownRow[];
};
