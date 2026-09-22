export type TopUpPack = { id: string; credits: number; priceIdr: number };

/** Fixed Top-Up Packs, tax included (ADR-0023). Priced at Rp250 per Credit with
 * volume discounts — see docs/research/ai-agent-session-cost.md §10. A price
 * change is a deploy; Top-Up Payments already created keep their own amount. */
export const topUpPacks: readonly TopUpPack[] = [
  { id: "credits-1000", credits: 1_000, priceIdr: 250_000 },
  { id: "credits-5000", credits: 5_000, priceIdr: 1_125_000 },
  { id: "credits-20000", credits: 20_000, priceIdr: 4_000_000 },
];

export function findTopUpPack(packId: string) {
  return topUpPacks.find((pack) => pack.id === packId);
}
