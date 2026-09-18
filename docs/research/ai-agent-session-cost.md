# AI Agent session cost: method and first measurement

What one Session costs the platform in model and API spend, how that is measured, and what it adds up to per month. Human-agent comparison and hosting (VPS) are deliberately out of scope for now.

Measured 2026-09-17 against the eval Workspace (`admin@demo.supportops.dev`, the same AI Agent, Knowledge Sources, and Tool Assignments the eval suite uses). Raw profile: [`cost-runs/2026-09-17-gpt-5.6-luna-deepseek-v4-flash-0731.json`](cost-runs/2026-09-17-gpt-5.6-luna-deepseek-v4-flash-0731.json).

## 1. The cost model

The unit of measurement is the **AI Turn** (see `CONTEXT.md`); the unit reported is the **Session**. Costs split by what they scale with:

| Group | Scales with | Line items |
| --- | --- | --- |
| Variable per Session | Sessions | main LLM (replies, Tool loop, mutation-confirmation checks, Escalation Summary), fast LLM (classification until a Ticket exists, attachment Ticket opener), embeddings (retrieval queries, Ticket Knowledge on resolve) |
| Variable per Attachment | Attachments | Mistral OCR (PDF, image), Mistral transcription (WhatsApp voice notes) |
| Fixed per Workspace per month | Knowledge base size | Mistral OCR of PDF Knowledge Sources, embedding of Chunks, Tavily crawl of documentation URLs, re-crawls |
| Channel | WhatsApp messages | Meta template charges |

For one completion call:

```
cost = cached_input   × price_cache_read
     + cache_write    × price_cache_write
     + (input − cached_input − cache_write) × price_input
     + output         × price_output        # output includes reasoning tokens
```

A Session's cost is the sum over every provider call it caused, plus `pages × OCR price` and `tokens × embedding price`. A month is:

```
monthly = Σ_script (share_script × sessions × session_cost_script)
        + fixed Workspace costs
        + WhatsApp charges
```

`share_script` is the scenario mix in §4.

## 2. How it is measured

`pnpm cost:measure` (`scripts/cost-measure.ts`):

- Runs the real API and the attachment / Ticket Knowledge workers in one process and drives **scripted Sessions through the Web Widget HTTP API** (`/widget/pre-chat`, `/widget/messages`, `/widget/attachments`). Every production step runs: classification, the AI Agent turn with agentic retrieval and Shopify MCP Tools, attachment OCR, Escalation, Handoff with Escalation Summary, Ticket Knowledge indexing.
- Records usage by **tapping `fetch`**: every call to `/chat/completions`, `/embeddings`, and Mistral OCR/transcription is captured with the provider's raw `usage`. Main vs fast is told apart by the request's `model`. No production code is instrumented.
- Records Tool calls per run from AI Activity (`TOOL_CALLED` / `TOOL_FAILED`).
- Runs each script 3× and reports the **median** per call kind and field.
- Deletes every measurement Session afterwards (Tickets, Messages, AI Activity, Ticket Knowledge Chunks, attachment objects), so the eval Workspace is left as found. Leftovers from a killed run are removed on the next start.
- Ingests the eight `docs/knowledge/*.pdf` files into a throwaway Workspace to price Knowledge ingestion, then deletes it.
- Saves progress after every run and **resumes** an unfinished profile for the same models, so an error never re-measures completed runs.

The dev worker must be stopped while it runs; otherwise it consumes this run's jobs outside the tap.

### Measuring another model

Change `LLM_MODEL_MAIN`, `LLM_MODEL_FAST`, or `EMBEDDING_MODEL` in `.env.local` and run `pnpm cost:measure` again. The profile file name carries the models, so earlier profiles are kept. Token counts are model-specific (tokenizer, reasoning, how many Tool-loop steps the model takes), so a new model is re-measured rather than re-priced.

## 3. Results

### Prices used

As quoted by the completion gateway (`gateway.devscale.id`) and providers, USD per 1M tokens unless noted.

| Item | Input | Cache read | Cache write | Output | Source |
| --- | --- | --- | --- | --- | --- |
| Main: `gpt-5.6-luna` (≤272K context) | 0.20 | 0.02 | 0.25 | 1.20 | gateway price list, provided by the team |
| Fast: `deepseek-v4-flash-0731` | 0.03 | 0.01 | — | 0.13 | gateway price list, provided by the team |
| Embedding: `openai/text-embedding-3-small` | 0.02 | — | — | — | provided by the team (OpenRouter) |
| Mistral OCR (`mistral-ocr-latest`) | $4 / 1,000 pages (batch: half) | | | | [mistral.ai/pricing/api](https://mistral.ai/pricing/api) |
| Mistral Voxtral Mini transcription | $0.003 / minute | | | | [mistral.ai/pricing/api](https://mistral.ai/pricing/api) |
| Tavily | $0.008 / credit pay-as-you-go ($0.0075–0.005 on plans) | | | | [docs.tavily.com](https://docs.tavily.com/documentation/api-credits) |

Every Session stays far below 272K tokens per request, so the higher tier never applies.

### Tokens per Session (median of 3 runs)

| Script | What it is | Customer msgs | Main calls | Main input | cached | cache write | Main output (reasoning) | Fast calls / in / out | Embedding tokens | OCR pages | Outcomes (3 runs) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `small-talk` | Greeting only, never a Ticket | 3 | — | — | — | — | — | 3 / 3,112 / 567 | — | — | NO_TICKET ×3 |
| `faq-short` | One Knowledge question, then solved | 2 | 3 | 41,333 | 39,687 | — | 209 (65) | 1 / 1,012 / 183 | 113 | — | RESOLVED ×3 |
| `order-tool` | Two catalog lookups, one order lookup | 3 | 8 | 151,069 | 123,303 | — | 816 (226) | 1 / 1,018 / 291 | 28 | — | ESCALATED (BUSINESS_TOOL_FAILURE) ×3 |
| `faq-multi` | Five Knowledge questions, then solved | 6 | 11 | 159,736 | 123,169 | — | 808 (198) | 1 / 1,009 / 214 | 512 | — | RESOLVED ×2; ESCALATED (CONFLICTING_KNOWLEDGE) |
| `purchase` | Purchase intent: full Tool manifest | 4 | 13 | 216,088 | 189,214 | 0 | 1,676 (650) | 1 / 1,021 / 434 | 43 | — | AI_HANDLING ×3 |
| `attachment` | Invoice PDF + payment screenshot | 2 | 3 | 41,374 | 26,817 | — | 314 (122) | 1 / 1,077 / 522 | 15 | 2 | ESCALATED (CUSTOMER_REQUESTED_HUMAN; INTERNAL_ACTION_REQUIRED ×2) |
| `escalation` | AI escalates, Human Agent claims (Escalation Summary) | 3 | 4 | 43,837 | 39,657 | 1,733 | 770 (338) | 1 / 1,006 / 205 | 22 | — | HUMAN_HANDLING (INTERNAL_ACTION_REQUIRED) ×3 |
| `long-session` | 15 mixed questions, full manifest | 15 | 18 | 315,886 | 278,614 | — | 1,459 (451) | 1 / 1,009 / 613 | 100 | — | ESCALATED (NO_RELEVANT_KNOWLEDGE ×2; BUSINESS_TOOL_FAILURE) |

"—" under cache write means the gateway did not report it.

### Cost per Session

Low = uncached input priced as input ($0.20); high = uncached input priced as cache write ($0.25) wherever the gateway did not report cache writes.

| Script | Low | High | Dominant line |
| --- | --- | --- | --- |
| `small-talk` | $0.00012 | $0.00012 | fast LLM |
| `faq-short` | $0.00141 | $0.00150 | main LLM |
| `escalation` | $0.00268 | $0.00268 | main LLM |
| `order-tool` | $0.00905 | $0.01044 | main LLM |
| `faq-multi` | $0.01080 | $0.01263 | main LLM |
| `purchase` | $0.01124 | $0.01124 | main LLM |
| `attachment` | $0.01190 | $0.01263 | Mistral OCR ($0.008 for 2 pages) |
| `long-session` | $0.01487 | $0.01674 | main LLM |

Main LLM is 97–99% of every Session that reaches it; `small-talk` never does, and `attachment` is dominated by OCR. Embeddings are under $0.00002 per Session and fast-LLM classification under $0.0001.

## 4. Scenarios and monthly cost

Share of Sessions per script (editable in the calculator):

| Script | Best | Typical | Worst |
|---|---|---|---|
| `small-talk` | 20% | 10% | 5% |
| `faq-short` | 50% | 30% | 10% |
| `faq-multi` | 20% | 25% | 20% |
| `order-tool` | 10% | 20% | 20% |
| `purchase` | 0% | 5% | 15% |
| `attachment` | 0% | 5% | 10% |
| `escalation` | 0% | 5% | 10% |
| `long-session` | 0% | 0% | 10% |

| Scenario | Per Session | 1,000 Sessions/mo | 10,000 | 100,000 |
|---|---|---|---|---|
| Best | $0.0038–0.0043 | $3.79–4.34 | $37.94–43.44 | $379–434 |
| Typical | $0.0062–0.0070 | $6.24–7.04 | $62.36–70.35 | $624–704 |
| Worst | $0.0087–0.0097 | $8.75–9.66 | $87.48–96.61 | $875–966 |

At Rp17,700/USD (2026-09-17), a typical 10,000-Session month is about **Rp1.1–1.25 juta** in AI spend.

## 5. Fixed and channel costs

**Knowledge ingestion (measured).** The eight PDFs are 57 pages → 240 Chunks, 21,941 embedding tokens: **$0.228 OCR + $0.0004 embeddings**, once per upload or re-publish. OCR is the whole cost; embeddings are negligible.

**Tavily crawl (computed, not measured).** A crawl costs mapping (1 credit per 10 pages) plus basic extraction (1 credit per 5 pages). The code caps a documentation crawl at 25 pages (`apps/worker/src/knowledge-ingest.ts:218`): 3 + 5 = **8 credits ≈ $0.064 per URL** pay-as-you-go. A single-page URL source costs 1 credit.

**WhatsApp (estimate, not measured).**
- Meta does not charge inbound messages, free-form replies inside the Customer Service Window, or utility templates inside the window; only delivered templates are charged ([Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
- SupportOps sends a template (`supportops_reopen_conversation`, `packages/channels/src/index.ts:304`) only when a message leaves after the 24-hour window has closed — in practice a Human Agent replying late. Timers are already held inside the window. So a WhatsApp Session costs **$0 in Meta fees** unless a late human reply triggers a template.
- Indonesia template rates reported by a third party (utility Rp356.65, marketing Rp586.33, +11% VAT, from July 2026) are **not verified** against Meta's rate card.
- Voice notes add **$0.003 per minute** of Mistral transcription. AI Turn token cost is assumed equal to the Web Widget, since the same `runAiAgentTurn` runs in the worker (ADR-0019); this was not measured.

**Suggested Reply (estimate, not measured).** In this Workspace the Copilot always looks the Customer up in the Business System (`apps/api/src/modules/tickets/services.ts:898`) and fails outright when it is unreachable, so it could not be measured without it. One request is a single main-LLM call over the conversation, Knowledge, and read-only Tool results, uncached: roughly 8K input + 400 output ≈ **$0.002 per request**.

## 6. What the numbers do and do not say

- **Input caching is what keeps this cheap.** Main-LLM input is 65–96% cached. The uncached remainder, not output, is the largest single line — anything that breaks the prompt-cache prefix (see `ai-agent-cost-and-latency.md` §3.3) moves cost more than any other change.
- **Tool use multiplies main-LLM calls.** A Knowledge answer is ~2 calls per Customer message (search, then reply); a Shopify lookup adds more. `purchase` makes 13 calls for 4 messages.
- **`long-session` never reaches 15 AI Turns.** The AI Agent escalated after 8–9 replies in all three runs, so the measured worst case is truncated. A real 15-turn Session would cost more.
- **Order lookups always escalate in this configuration.** Shopify's `get_order` requires a Global API JWT and only returns orders placed through the agent's own checkout ([Order MCP](https://shopify.dev/docs/agents/orders/order-mcp)); the MCP Server holds no such token. `order-tool` measures a failed lookup followed by Escalation.
- **Outcomes vary between runs** (`faq-multi` escalated once on conflicting return windows; `attachment` once as CUSTOMER_REQUESTED_HUMAN instead of INTERNAL_ACTION_REQUIRED). Medians absorb this, but three runs is a small sample.
- **Cache writes are mostly unreported** by the gateway for the main model; the low/high range covers it and the gap is ≤15%.
- **Gateway markup** is assumed to be inside the quoted prices.
- **Live side effects:** `purchase` creates real carts on the Northstar Outfitters demo store through `create_cart`. No checkout is completed.

## Sources

- Measured profile: `docs/research/cost-runs/2026-09-17-gpt-5.6-luna-deepseek-v4-flash-0731.json`
- [Mistral API pricing](https://mistral.ai/pricing/api)
- [Tavily API credits](https://docs.tavily.com/documentation/api-credits)
- [WhatsApp Business Platform pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [WhatsApp API pricing in Indonesia (third party, unverified)](https://chatmaxima.com/whatsapp-api-pricing/indonesia/)
- [Shopify Order MCP server](https://shopify.dev/docs/agents/orders/order-mcp)
- [USD/IDR, Investing.com](https://www.investing.com/currencies/usd-idr)
