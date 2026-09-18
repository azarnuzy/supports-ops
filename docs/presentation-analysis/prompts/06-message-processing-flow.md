# 06 — End-to-End Message Processing Flow Analysis

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Setiap tahap flow harus menjawab dengan jelas: siapa melakukan apa, data apa yang berubah, dan kenapa tahap itu diperlukan.

Lakukan analisis **END-TO-END MESSAGE PROCESSING FLOW** SupportOps.

Pertanyaan yang harus dijawab adalah:

> "Apa sebenarnya yang terjadi setelah customer mengirim message?"

Trace actual implementation dari:

Customer Message

sampai salah satu hasil akhir:

- REPLY
- CLARIFY
- ESCALATE
- RESOLVE

Cari seluruh tahapan penting.

Contohnya dapat mencakup:

- Channel / Widget / WhatsApp
- Workspace resolution
- Session
- Ticket
- Message persistence
- Message intake
- Classification
- Context loading
- Workspace Instructions
- Knowledge retrieval
- Customer data
- Attachment context
- Available tools
- MCP tool discovery / execution
- Shopify business context jika digunakan
- AI reasoning
- Tool calling
- Tool result
- Structured decision
- Response
- Streaming
- Persistence
- Background processing

Tetapi jangan memasukkan step jika tidak benar-benar ada.

Identifikasi juga alternative path:

- Knowledge cukup
- Knowledge tidak cukup
- Tool diperlukan
- Tool berhasil
- Tool gagal
- MCP unavailable
- Shopify data tidak ditemukan
- AI tidak memiliki context cukup
- Customer meminta human
- Policy / Instructions menyebabkan escalation
- Human mengambil alih
- Customer mengonfirmasi resolution
- WhatsApp menjadi channel sumber message

Bedakan setiap tahap menjadi:

- APPLICATION LOGIC
- AI DECISION
- POLICY / INSTRUCTIONS
- TOOL
- MCP
- ASYNC JOB
- HUMAN ACTION

Tujuan akhirnya bukan sequence diagram super detail.

Tujuannya adalah membuat satu business + technical flowchart yang dapat dipahami dalam 1–2 menit.

## Output

A. Canonical happy path

B. Alternative paths

C. Decision points

D. AI-driven decisions

E. Deterministic decisions

F. Policy / Instruction-driven behavior

G. Tool / MCP interaction

H. Failure paths

I. Human handoff boundary

J. Async processing

K. Simplified presentation flow

L. Bagian yang masih perlu diverifikasi

Simpan ke:

`docs/presentation-analysis/06-message-processing-flow.md`
