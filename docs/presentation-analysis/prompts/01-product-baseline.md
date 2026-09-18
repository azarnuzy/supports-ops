# 01 — Product & Repository Baseline Analysis

Baca terlebih dahulu:

`docs/presentation-analysis/00-analysis-contract.md`

Ikuti bagian **Aturan Bahasa**. Jelaskan produk dengan bahasa sederhana sebelum memakai istilah teknis.

Kemudian lakukan **PRODUCT & REPOSITORY BASELINE ANALYSIS** terhadap project SupportOps yang sedang terbuka di workspace ini.

Tujuan analisis ini adalah membangun mental model yang benar mengenai SupportOps sebelum membahas presentasi.

Jangan membuat slide.

Mulai dari level paling tinggi.

Cari tahu:

- sebenarnya SupportOps adalah produk seperti apa
- problem utama apa yang ingin diselesaikan
- siapa saja user / actor utamanya
- application apa saja yang berjalan
- domain bisnis utama
- komponen AI
- knowledge / retrieval
- tools
- MCP
- human support
- storage
- worker / asynchronous processing
- external integration
- observability
- evaluation

Identifikasi juga major end-to-end journey yang benar-benar didukung implementasi saat ini.

Contoh kategori capability yang dapat digunakan:

- Customer Interaction
- Support Operations
- AI Automation
- Knowledge & Retrieval
- Tools & Integrations
- Human Handoff
- Data & Persistence
- Background Processing
- Observability
- AI Evaluation

Jangan melakukan deep-dive ke setiap implementation dahulu.

Fokus membangun canonical model mengenai project ini.

Periksa juga apakah terdapat perbedaan antara:

- README
- documentation
- tests
- architecture intent
- actual implementation

Jika berbeda, jelaskan.

## Output

A. Definisi SupportOps dalam 1–2 kalimat

B. Problem yang ingin diselesaikan

C. Actor utama

D. Core capabilities

E. Major runtime components

F. System boundaries

G. Major end-to-end journeys

H. Implemented vs Partial vs Demo vs Intent

I. Technical differentiators yang mungkin menarik untuk presentasi

J. Area yang membutuhkan analisis lebih dalam

Untuk setiap temuan penting sertakan file path sebagai evidence.

Simpan hasil ke:

`docs/presentation-analysis/01-product-baseline.md`
