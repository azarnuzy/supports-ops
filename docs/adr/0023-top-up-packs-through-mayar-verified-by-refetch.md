# Top-Up Packs paid through Mayar, verified by re-fetch

An Admin buys Credits as a Top-Up Pack — one of a few fixed Credit amounts at a fixed Rupiah price, tax included, defined in code like the Model Catalog. Checkout creates a Mayar Single Payment Request and records a Top-Up Payment; the Credits land in the Credit Ledger only once Mayar confirms the payment. Nothing renews: prepaid Credits (ADR-0021) stay the only way a Workspace pays for AI.

Mayar's webhook carries no signature, so SupportOps never trusts its body. A webhook only says "go look": SupportOps fetches that payment from Mayar's API with its own key, and writes the Top-Up only if Mayar reports it paid for exactly the recorded amount. The same re-fetch runs when the Admin returns from checkout, so a lost webhook never strands a paid Top-Up. Marking the Top-Up Payment paid and writing its ledger entry happen in one transaction guarded on the payment still being pending, so a repeated webhook adds nothing.

## Considered Options

- **Subscription plans with a monthly Credit allowance.** Rejected: it brings renewals, proration, and failed-renewal states to a product whose Admins already plan around "one reply, one Credit", and a Top-Up Pack bought when needed covers the same need.
- **Midtrans or Xendit.** Both sign their webhooks. Rejected for now: the cost model (docs/research/ai-agent-session-cost.md §9–10) and its fee assumptions were built on Mayar, and re-fetching closes the gap an unsigned webhook leaves.
- **Trusting the webhook body.** Rejected: anyone who learns the webhook URL could post a fake `payment.received` and mint Credits.

## Consequences

- `pnpm credits:top-up` stays, for payments made outside the platform and for goodwill Credits.
- A pack's price changes with a deploy. Existing Top-Up Payments keep the price they were created with.
- An unpaid Top-Up Payment shows as expired once its checkout link lapses; no job sweeps it.
