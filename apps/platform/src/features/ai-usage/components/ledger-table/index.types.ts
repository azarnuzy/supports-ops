import type { useCreditLedgerQuery } from "../../ai-usage.hooks";

export type LedgerTableProps = {
  query: ReturnType<typeof useCreditLedgerQuery>;
};
