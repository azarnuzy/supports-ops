import type { CreditLedgerEntryType, UsageChannel } from "@repo/api-client";

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

export const channelLabels: Record<UsageChannel, string> = {
  WEB: "Web Widget",
  WHATSAPP: "WhatsApp",
};

const compactFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

/** 1.2K, 3.4M — Token counts are large and only read as magnitudes. */
export function formatTokens(tokens: number) {
  return compactFormat.format(tokens);
}

const idrFormat = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatIdr(amount: number) {
  return idrFormat.format(amount);
}

/** Percent change against the previous period; null when there is no baseline. */
export function percentChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

export function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
