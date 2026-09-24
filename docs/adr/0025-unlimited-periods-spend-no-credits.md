# Unlimited Periods record AI Turns without spending Credits

An Operator can grant a Workspace an Unlimited Period — typically a proof of concept, ending at 23:59 Asia/Jakarta on the chosen date, or without an end date until an Operator ends it. Inside it every AI Turn and Follow-Up is still written to the Credit Ledger with its Agent Model, Model Rate, Tokens, and provider cost, but spends zero Credits, so Credit Exhaustion cannot happen and the balance after the window is exactly the balance before it.

This is a deliberate exception to ADR-0021 ("always bought before it is spent").

## Considered Options

- **Spend Credits as usual and let the balance go negative.** Rejected: the Workspace would hit Credit Exhaustion the moment the proof of concept ended, escalating every Ticket, with a debt it never agreed to.
- **A very large manual Top-Up.** Rejected: it can still run out, it inflates Top-Up totals that are read as revenue, and it cannot end on a date.

## Consequences

- AI Usage still counts every AI Turn during the window, so the Operator sees what the trial would have cost in Model Rate Credits and in provider USD.
- At most one Unlimited Period is active per Workspace; it can be extended or ended early, and every grant, extension, and early end is recorded in the Operator Action log.
- An Admin sees that the Workspace is on an Unlimited Period, and when it ends, on the Billing page; no email is sent.
