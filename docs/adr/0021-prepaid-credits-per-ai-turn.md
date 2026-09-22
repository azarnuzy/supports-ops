# Prepaid Credits charged per AI Turn at a fixed Model Rate

A Workspace pays for AI with Credits bought in advance. Each completed AI Turn and each Follow-Up spends a fixed number of Credits set by the AI Agent's Agent Model — its Model Rate — however many Tool calls, retries, or cached tokens the turn actually used. Everything else the AI does (classification, Escalation Summaries, Suggested Replies, Attachment OCR and transcription, Knowledge ingestion) is absorbed by the platform and priced into the Model Rate. SupportOps calls every model with its own gateway key.

## Considered Options

- **Bring your own key**, the pattern WhatsApp already uses (ADR-0018). Rejected: it removes the platform's cost risk but also its only revenue line, and it hands every Workspace the job of creating and funding an OpenRouter account before its AI Agent can answer a single Customer.
- **Pay-as-you-go, invoiced monthly.** Rejected for the MVP: it needs stored payment methods, invoicing, and collections, and it carries unpaid-invoice risk that prepaid Credits cannot.
- **Deducting the provider's actual cost plus a markup.** Rejected: it protects margin perfectly, but an Admin can no longer predict when the balance runs out. "One reply costs one Credit" is a promise an Admin can plan around. The actual provider cost is still recorded on every spend so the Model Rate can be corrected when measurement says it is wrong.

## Consequences

- **Running out of Credits escalates, it never goes silent.** At Credit Exhaustion the running AI Turn finishes (the balance may dip slightly below zero), the next Customer Message escalates with its own Escalation Reason, and the AI Copilot is unavailable. An escalated Ticket does not return to the AI Agent after a Top-Up — Escalation stays final.
- **Eval runs spend Credits** like any other AI Turn, from the Workspace named by `EVAL_WORKSPACE_ID`. A suite that exhausts it shows Credit Exhaustion as the Escalation Reason rather than looking like an AI regression.
- **The Credit Ledger outlives the Tickets it was spent on.** Eval runs delete their scratch Ticket and Tickets can be deleted; the spend they caused must remain, or the balance and AI Usage would change retroactively.
- **The Rupiah price of a Credit is not in the code.** Top-Ups are recorded by SupportOps after payment, so price changes need no deploy.
