# 09 — AI Agent Cost Model Analysis

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Jelaskan rumus dan biaya dengan contoh satu percakapan sebelum membahas model perhitungan yang lebih besar.

Analisis **COST MODEL** untuk menjalankan SupportOps AI Agent.

Jangan menggunakan harga model dari ingatan.

Jangan mencari harga dari internet.

Tujuan tahap ini hanya membangun unit economics model berdasarkan actual architecture SupportOps.

Cari cost driver seperti:

- LLM input token
- LLM output token
- embedding
- jumlah model invocation
- tool loop
- retrieval
- MCP invocation
- Shopify API / external integration jika memiliki cost relevan
- summarization
- handoff summary
- suggested reply
- evaluation
- observability
- storage
- database
- queue
- worker
- external API

jika relevan.

Pisahkan:

- VARIABLE COST
- SEMI-VARIABLE COST
- FIXED INFRASTRUCTURE COST

Kemudian cari unit yang paling masuk akal.

Misalnya:

- Cost per AI turn
- Cost per conversation
- Cost per ticket
- Cost per AI-resolved ticket
- Monthly cost per N conversations

Analisis unit mana yang paling meaningful untuk audience bisnis.

Bangun conceptual calculator.

Contoh variable:

- Monthly Conversations
- Average Messages / Conversation
- AI Invocation / Message
- Average Input Tokens
- Average Output Tokens
- Tool Invocation Rate
- MCP Invocation Rate
- Escalation Rate
- AI Resolution Rate
- Model Price Input
- Model Price Output
- Embedding Cost
- Infrastructure Cost

Tetapi sesuaikan dengan actual architecture.

Identifikasi metric mana yang mungkin bisa diambil langsung dari telemetry SupportOps.

Rancang tiga skenario tanpa angka harga:

- LOW
- NORMAL
- HIGH

Jika system memungkinkan beberapa model strategy, pertimbangkan:

- Economy
- Balanced
- Quality

tetapi hanya jika sesuai actual design.

## Output

A. Cost drivers

B. Formula dasar

C. Unit economics

D. Calculator variables

E. Variable yang sudah bisa diukur

F. Variable yang masih berupa asumsi

G. Scenario model

H. Kandidat visualization

I. Data eksternal yang nantinya dibutuhkan

J. Cost yang bisa diabaikan untuk presentasi

Simpan ke:

`docs/presentation-analysis/09-cost-model.md`
