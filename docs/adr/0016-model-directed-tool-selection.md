---
status: accepted
---

# The model selects Tools; Admins steer with text, not rules

SupportOps drops category-based Tool Policies. An AI Agent's Tool set is still resolved server-side from Workspace-scoped Tool Assignments, but nothing forces a call: every assigned Tool is offered to the model, and the model decides which to invoke from each Tool's description plus the Admin's per-assignment usage instruction. This is the shape every comparable platform ships — ElevenLabs Agents, Zendesk, and Intercom all steer Tool selection through descriptions and guidance text rather than a rule table — and it removes a mechanism that ran the same zero-argument Tool on every Customer Message of a Ticket.

The alternative considered was keeping the mechanism and moving it to conversation start, in the shape of ElevenLabs' conversation-initiation webhook. It is deferred rather than rejected: it is a separate concept from Tools, and nothing in the product needs it yet.

Two consequences follow. The reply prompt no longer carries a "required Tool data" section, so a Tool Result reaches the model only through the tool-calling loop, where the runtime already wraps it as untrusted `role: "tool"` data. And the pre-generation Escalation gate now also checks whether the AI Agent has any assigned Tool: an Agent with Tools gets its turn even when Knowledge retrieval comes back empty, because the Tool Result is the grounding. `BUSINESS_TOOL_FAILURE` survives as an Escalation reason the model chooses when a call it made fails.

Everything ADR-0015 decided about authorization still holds: one orchestration path for all three Tool origins, no broadening of the Tool set from model or Customer input, platform safety instructions outranking configurable AI Agent instructions, and remote MCP over Streamable HTTP with static secret headers.
