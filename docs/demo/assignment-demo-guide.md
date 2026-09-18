# Assignment demo guide — proving the 5 requirements end-to-end

Devscale "AI Product Engineering Typescript — Batch I" final assignment requirements:

1. Product Requirements Document (before coding work)
2. Agents with Tools
3. MCP and RAG
4. Evals and Observability
5. Minimum 1 Agentic Workflow + 1 AI Agent

SupportOps already implements all five in code. This guide maps each requirement to where
it lives in this repo and gives you a recording order. The only things you still need to
do by hand are in **§0 — What you still add manually**; everything else already runs via
`pnpm seed:demo` and the existing app.

---

## 0. What you still add manually

| # | What | Where | Source |
| - | ---- | ----- | ------ |
| 1 | Upload the 10 Knowledge Base documents as PDFs | `/knowledge`, Add → PDF | Content in `docs/demo/knowledge-base/*.md` — copy each into a doc editor, export as PDF, upload with the visibility named in the file (`customer-safe-*` → Customer-Safe, `internal-*` → Internal-Only) |
| 2 | Paste the AI Agent instructions, Handoff Message, Resolution Message | `/agent` | `docs/demo/agent-instructions.md` |
| 3 | Paste each Tool's "When to use this tool" text | `/agent/tools` → Tool detail | `docs/demo/agent-instructions.md` |
| 4 | Confirm the HTTP Tool and MCP Server exist and are enabled | `/agent/tools`, `/agent/mcp-servers` | Created automatically by `pnpm seed:demo`; verify only |

Everything else (Workspace, Admin/Human Agent accounts, demo conversations, the HTTP Tool
and MCP Server themselves) is seeded by `scripts/seed-demo.ts` — see
`docs/testing/e2e-runbook.md` §1–2 for the exact commands to bring the stack up.

Why 10 new Knowledge documents instead of reusing the 7 the seed script already creates:
the seed's content (plans, password reset, refund policy, etc.) is what the automated eval
suite and existing demo conversations already exercise. New topics (2FA, API keys, widget
troubleshooting, data export, SLA, plus 4 Internal-Only SOPs) let you ask the AI Agent
questions live on camera that are obviously not memorized from the eval corpus, which is
a stronger proof of real retrieval.

---

## 1. Product Requirements Document

**Artifact:** `supportops_prd.md` (repo root) — written before implementation, covers
product summary, problem statement, users, and scope.

**Supporting artifacts:** `docs/adr/` — 19 Architecture Decision Records recording *why*
specific technical choices were made after the PRD (e.g. `0002-anvia-v1-as-agent-runtime.md`,
`0016-model-directed-tool-selection.md`). Showing these alongside the PRD demonstrates the
requirements → architecture → implementation chain, not just a document that was written
and ignored.

**On camera:** open `supportops_prd.md`, scroll through sections 1–3, then open one or two
ADRs that trace a PRD decision (e.g. "AI Agent and Channel layer must remain separate" in
the PRD → `0001-monorepo-app-and-package-topology.md`).

---

## 2. Agents with Tools

**Artifact:** `packages/tools` (Business Tool boundary), `packages/ai-agent` (the agent that
calls them), `apps/api/src/modules/tools` (HTTP Tool CRUD + authorization + orchestration).

**Design record:** `docs/adr/0015-assigned-tools-through-one-ai-agent-runtime.md` and
`docs/adr/0016-model-directed-tool-selection.md` — the model chooses which assigned Tool to
call from its description and "when to use" guidance; nothing hardcodes tool routing.

**Demo data:** the seeded `getSubscriptionStatus` HTTP Tool (see §0.4), pointed at
`apps/business-system` acting as a live backend.

**On camera (scenario W3 in the runbook):** as a Customer in the Widget, ask *"Is my
subscription active?"*. The AI Agent picks the Tool itself, calls it, and answers from the
live response — not from Knowledge. Open the ticket's **Activity Timeline** in `/chat` and
point at the `TOOL_CALLED` entry with origin `HTTP`.

---

## 3. MCP and RAG

### MCP

**Artifact:** `apps/business-system/src/mcp.ts` — a real MCP server (Streamable HTTP)
exposing `getInvoiceStatus`. `apps/api/src/modules/mcp` — MCP client: server registration,
connection test, tool discovery, and review-before-enable workflow.

**On camera (scenario W3a):** `/agent/mcp-servers` — show the registered "Business System Demo"
server, **Test Connection**, and the discovered `getInvoiceStatus` Tool already reviewed
and enabled (§0.4). Then in the Widget, ask *"What's the status of my latest invoice?"* —
the AI Agent picks the MCP Tool over the HTTP Tool because the guidance text says so.
Activity Timeline shows `TOOL_CALLED` with origin `MCP`.

Optional negative-control shot (W3b): disable the MCP tool, ask the same question again,
and show the AI Agent falling back to Knowledge or escalating instead of calling a disabled
Tool — proves Tool selection is gated, not just prompted.

### RAG

**Artifact:** `packages/knowledge` — chunking, embeddings, pgvector-backed retrieval
(`docs/adr/0003-pgvector-over-qdrant.md`). `/knowledge` in the Platform — upload, ingestion
status, visibility, and a **Test retrieval** dialog that runs the same search the AI Agent
uses.

**Demo data:** the 10 documents in `docs/demo/knowledge-base/` (§0.1) — 6 Customer-Safe,
4 Internal-Only.

**On camera:**
- Upload 2–3 of the PDFs live, showing status go Processing → Published.
- Use **Test retrieval** with a query like "how do I recover 2FA" and show it returns the
  Internal-Only SOP chunk (proving retrieval works across visibility) — then show a Widget
  conversation asking the *same* question as a Customer, and point out the AI Agent never
  quotes the Internal-Only content back, only escalates. This is the strongest single shot
  for proving RAG + grounding + visibility enforcement together.
- Ask a question with no matching source at all (e.g. "do you support Slack integration?")
  and show the AI Agent declining to invent an answer and escalating instead — this is what
  "Answer only from retrieved sources" in the instructions (§0.2) is for.

---

## 4. Evals and Observability

### Evals

**Artifact:** `apps/api/src/evals` — Eval Cases run against the live Workspace named by
`EVAL_WORKSPACE_ID`, graded by per-metric suites: `contains`, `exactmatch`, `relevancy`,
`faithfulness`, `geval`, `decision`, `tool`, `visibility`, `language`, `retriever`,
`retrieval`, `negativecontrol`. `negativecontrol` is a canary expected to fail.
`docs/adr/0010-otlp-observability-and-manual-evals.md` records why evals are code-defined
rather than a separate tool; `docs/testing/ai-agent-eval-cases.md` lists the Cases.

**On camera:**

```sh
pnpm eval:ai-agent
```

Show the summary output, then re-run one suite in isolation to demonstrate the negative
control failing on purpose:

```sh
pnpm eval:ai-agent negativecontrol
```

### Observability

**Artifact:** `packages/logger/telemetry` — OpenTelemetry spans for AI Agent runs, model
generations (`gen_ai.*`), retrieval, and Tool calls only (infrastructure is not
auto-instrumented, by design — see the ADR above).

**On camera:** with `TELEMETRY_EXPORTER=console` (fastest to show with no external
account) or Langfuse (`docs/testing/e2e-runbook.md` §6 has the full setup), run one Widget
conversation and open the resulting trace. Point at the root `ai_agent.run` span, the
retrieval child span, the Tool call span, and the model generation span, then the final
decision attribute (`REPLY` / `CLARIFY` / `ESCALATE` / `RESOLVE`).

---

## 5. Minimum 1 Agentic Workflow + 1 AI Agent

**The AI Agent:** `packages/ai-agent/src/turn.ts` — a single reasoning agent that, per
Customer turn, classifies intent, retrieves Knowledge, decides whether to call a Tool,
and produces one of four decisions: `REPLY`, `CLARIFY`, `ESCALATE`, `RESOLVE`. This is the
"1 AI Agent."

**The agentic workflow:** the full loop is multi-step and conditional, not a single prompt
call — classification → retrieval → tool-selection/tool-call → decision → (on `ESCALATE`)
handoff to a Human Agent with an auto-generated Escalation Summary, or (on `RESOLVE`)
session close. That branching, tool-using loop is the "1 Agentic Workflow."

**On camera:** this is the sum of scenarios W2 (grounded reply), W3/W3a (tool-calling),
W4–W6 (escalation → claim → handoff → human resolution), and W7 (AI-driven resolution on
Customer confirmation) from `docs/testing/e2e-runbook.md` §4 — you don't need new steps
here, just narrate that the same conversation you're already showing for §2–§3 above *is*
the agentic workflow, end to end.

---

## Suggested recording order

1. PRD + ADRs (§1) — 1–2 minutes, static reading.
2. Upload Knowledge PDFs + paste instructions (§0) — setup, can be sped up/cut.
3. One Widget conversation per scenario: grounded answer (W2), HTTP Tool (W3), MCP Tool
   (W3a), Internal-Only isolation shot (§3 RAG), escalation → human handoff (W4–W6),
   AI-driven resolution (W7) — narrate Activity Timeline entries as you go.
4. `pnpm eval:ai-agent` full run + one isolated category (§4).
5. Telemetry trace walkthrough for the W3a conversation (§4).

Everything in steps 3–5 is one continuous product demo; steps 1 and 2 are the only parts
that are "documentation," not "live product."
