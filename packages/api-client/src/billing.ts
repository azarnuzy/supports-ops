import type { ModelCatalogEntry } from "./ai-settings";
import type { ApiClient } from "./client";
import type { UsageChannel } from "./usage";

export type CreditLedgerEntryType = "TRIAL_GRANT" | "TOP_UP" | "SPEND";

export type TopUpPack = { id: string; credits: number; priceIdr: number };
export type TopUpPayment = {
  id: string;
  packId: string;
  credits: number;
  amountIdr: number;
  status: "PENDING" | "PAID" | "EXPIRED";
  checkoutUrl: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
};
export type UnlimitedPeriod = { endAt: string; endedEarlyAt: string | null };

export type Billing = {
  balance: number;
  modelRates: readonly ModelCatalogEntry[];
  packs: readonly TopUpPack[];
  payments: readonly TopUpPayment[];
  paymentsEnabled: boolean;
  unlimitedPeriod: UnlimitedPeriod | null;
};

export async function fetchBilling(client: ApiClient) {
  const response = await client.billing.$get();
  if (response.status === 403) throw new Error("Only an Admin can manage billing.");
  if (!response.ok) throw new Error("Failed to load billing.");
  return (await response.json()) as { billing: Billing };
}

export async function createTopUpCheckout(client: ApiClient, packId: string) {
  const response = await client.billing.checkout.$post({ json: { packId } });
  if (response.status === 503) {
    throw new Error("Online payments are unavailable right now. Please try again later.");
  }
  if (!response.ok) throw new Error("Failed to start checkout.");
  return (await response.json()) as { payment: TopUpPayment };
}

/** Never carries `modelRate` or provider cost. Tokens are informational only. */
export type CreditLedgerEntry = {
  id: string;
  type: CreditLedgerEntryType;
  credits: number;
  note: string | null;
  aiAgentId: string | null;
  agentModel: string | null;
  channel: UsageChannel | null;
  inputTokens: number | null;
  outputTokens: number | null;
  sessionId: string | null;
  ticketId: string | null;
  createdAt: string;
};

export async function fetchCreditLedger(
  client: ApiClient,
  params: { cursor?: string; limit?: number } = {},
) {
  const query = {
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
  };
  const response = await client["ai-usage"].ledger.$get({ query });
  if (response.status === 403) throw new Error("Only an Admin can view the Credit Ledger.");
  if (!response.ok) throw new Error("Failed to load the Credit Ledger.");
  return (await response.json()) as {
    entries: CreditLedgerEntry[];
    nextCursor: string | null;
    total: number;
  };
}
