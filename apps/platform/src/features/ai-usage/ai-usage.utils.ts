import type { CreditLedgerEntryType } from "@repo/api-client";

export const lowBalanceThreshold = 100;

export const ledgerEntryTypeLabels: Record<CreditLedgerEntryType, string> = {
  TRIAL_GRANT: "Trial Grant",
  TOP_UP: "Top-Up",
  SPEND: "Spend",
};

const creditsFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatCredits(credits: number) {
  return creditsFormat.format(credits);
}

/** Ledger rows store spend as negative credits; the sign itself already
 * distinguishes spend from grants, so the display keeps it. */
export function formatSignedCredits(credits: number) {
  const formatted = creditsFormat.format(Math.abs(credits));
  return credits < 0 ? `-${formatted}` : `+${formatted}`;
}

export function formatLedgerTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
