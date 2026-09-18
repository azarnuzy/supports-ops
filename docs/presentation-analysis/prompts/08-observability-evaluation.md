# 08 — Observability & AI Evaluation Analysis

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Setiap istilah Observability atau Evaluation harus langsung dihubungkan dengan pertanyaan praktis yang dapat dijawabnya.

Analisis bagaimana SupportOps melakukan:

## OBSERVABILITY

dan

## AI EVALUATION

Jangan memperlakukan keduanya sebagai hal yang sama.

Gunakan definisi:

### OBSERVABILITY

> "Apa yang sebenarnya terjadi pada runtime request?"

### EVALUATION

> "Apakah AI Agent berperilaku sesuai yang kita harapkan?"

## Observability

Cari implementasi:

- structured logging
- OpenTelemetry
- trace
- span
- AI Agent span
- retrieval span
- model span
- tool span
- MCP span
- Shopify/tool execution span jika ada
- final decision
- latency
- token usage jika ada
- error
- redaction
- telemetry export
- Langfuse
- atau observability system lainnya

Buat actual tracing hierarchy jika bisa dibuktikan dari source.

## Evaluation

Cari:

- eval runner
- workspace evaluation configuration
- test dataset
- evaluation cases
- category
- expected answer
- expected decision
- retrieval evaluation
- tool evaluation
- MCP/Shopify-related evaluation jika ada
- escalation evaluation
- negative control
- failure case
- regression test

Periksa apakah evaluation menggunakan:

- live database
- workspace configuration
- seed data
- fixture
- in-memory corpus
- mock
- real LLM
- deterministic test
- atau kombinasi

Jelaskan alasan desainnya jika dapat dibuktikan.

Kemudian cari hubungan:

### Production interaction

runtime request  
→ telemetry  
→ trace  
→ investigation

dibandingkan dengan:

### Agent change

configuration / prompt / implementation change  
→ eval suite  
→ result  
→ regression detection

Analisis juga apakah workspace demo yang sudah memiliki evaluation configuration dapat digunakan untuk menunjukkan evaluation langsung saat presentasi.

Cari metric yang benar-benar sudah tersedia.

Jangan mengarang metric production.

## Output

A. Observability architecture

B. Trace lifecycle

C. Available telemetry

D. Evaluation architecture

E. Peran workspace evaluation configuration

F. Evaluation categories

G. Observability vs Evaluation

H. Reliability question yang dijawab masing-masing

I. Kandidat demo

J. Kandidat visualization

K. Limitation saat ini

L. Improvement yang bisa menjadi future work

Simpan ke:

`docs/presentation-analysis/08-observability-evaluation.md`
