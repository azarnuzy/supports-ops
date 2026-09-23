# Credits

Every Workspace pays for AI with Credits, tracked in the append-only Credit Ledger — see [ADR-0021](../adr/0021-prepaid-credits-per-ai-turn.md). Registration writes a 500-Credit Trial Grant in the same transaction that creates the Workspace; no setup is needed for that.

## Recording a Top-Up

A signed-in Operator can record a Top-Up in the Console with a positive whole number of Credits and a required payment note. The Console records the Operator and the Credit Ledger entry together. Use it after a payment lands outside the platform.

The server CLI remains available as a fallback. It records the Credit Ledger entry without an Operator Action:

```sh
pnpm credits:top-up <workspace-slug> <credits> "<note>"
```

For example:

```sh
pnpm credits:top-up acme-corp 5000 "Invoice #1042, paid 2026-09-22"
```

It rejects an unknown Workspace slug and a non-positive amount, and prints the Workspace's new balance on success.

## Checking a balance

```sh
pnpm db:studio
```

Open the `CreditLedgerEntry` table, filter by `workspaceId`, and sum `credits` — a Workspace's balance is always the sum of its ledger entries, never a separately stored number.
