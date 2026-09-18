# 07 — AI Agent Architecture Analysis

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Jelaskan cara kerja AI sebagai rangkaian keputusan yang mudah diikuti, bukan sebagai kumpulan jargon AI.

Lakukan deep analysis khusus terhadap **AI AGENT ARCHITECTURE** SupportOps.

Jangan menggambarkannya sebagai sekadar:

Prompt → LLM → Response.

Cari actual runtime flow dari satu AI Agent turn.

Analisis:

- Conversation Context
- Workspace Context
- AI Instructions
- Ticket Context
- Customer Context
- Knowledge Retrieval
- Visibility / Customer-safe knowledge
- Attachments
- Available Tools
- HTTP Tools
- MCP Tools
- Shopify MCP integration
- Model invocation
- Tool calling loop
- Tool results
- Structured output
- Decision routing
- Reply
- Clarify
- Escalate
- Resolve
- Human Handoff
- Suggested Reply / Copilot jika ada

Cari dengan jelas siapa yang membuat setiap keputusan.

Kelompokkan menjadi:

### A. LLM-driven

### B. Application-enforced

### C. Policy / Instruction / configuration-driven

### D. Tool / MCP result-driven

### E. Human-controlled

Ini adalah bagian terpenting analisis.

Kemudian analisis failure mode:

- retrieval kosong
- retrieval tidak relevan
- tool gagal
- MCP unavailable
- Shopify unavailable
- tool disabled
- business data tidak ditemukan
- model output invalid
- AI tidak yakin
- customer meminta manusia
- Instructions / policy mencegah AI melakukan action

Periksa juga:

- model provider abstraction
- model routing
- fast/main model jika benar-benar ada
- embedding model
- retry
- fallback
- timeout
- rate limit

jika memang diimplementasikan.

Jangan menambahkan capability hanya karena umum digunakan pada AI system.

Bandingkan hasil dengan diagram AI Agent Architecture existing.

Kelompokkan elemen existing menjadi:

- ACCURATE
- CONCEPTUAL
- MISLEADING
- MISSING
- TOO DETAILED

## Output

A. Mental model AI Agent

B. Agent execution stages

C. Agentic vs deterministic boundary

D. Workspace Instruction boundary

E. Retrieval architecture

F. Tool architecture

G. MCP / Shopify interaction

H. Model interaction

I. Decision router

J. Human handoff

K. Failure handling

L. Presentation-level AI architecture

M. Koreksi diagram existing

Simpan ke:

`docs/presentation-analysis/07-ai-agent-architecture.md`
