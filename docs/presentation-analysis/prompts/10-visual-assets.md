# 10 — Presentation Visual Asset Strategy

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Label dan penjelasan visual harus dapat dipahami tanpa membaca source code.

Baca seluruh hasil analisis 01 sampai 09.

Sekarang lakukan **PRESENTATION VISUAL ASSET ANALYSIS DAN GENERATION**.

Tujuannya menentukan visual yang benar-benar dibutuhkan, lalu menghasilkan ulang asset utama berdasarkan hasil analisis repository.

Tiga file berikut adalah asset lama yang sudah tidak akurat. Gunakan hanya untuk menemukan masalah visual atau informasi yang perlu dikoreksi. Jangan gunakan isi diagram lama sebagai source of truth:

1. `docs/presentation-analysis/prompts/System Context Diagram.png`
2. `docs/presentation-analysis/prompts/System Architecture.png`
3. `docs/presentation-analysis/prompts/AI Agent Architecture.png`

Ketiga asset tersebut wajib dibuat ulang dari nol berdasarkan actual implementation dan hasil analisis 01 sampai 09. Simpan hasil baru dengan nama dan path yang sama untuk menggantikan asset lama.

Pastikan ketiganya tidak menjadi tiga versi dari diagram yang sama:

- **System Context Diagram** menunjukkan aktor, SupportOps sebagai satu sistem, Channel, dan sistem eksternal.
- **System Architecture** menunjukkan runtime boundary, penyimpanan data, jalur sinkron/asinkron, dan integration boundary.
- **AI Agent Architecture** menunjukkan satu AI Turn, sumber context, retrieval, Tool/MCP loop, deterministic guardrails, decision routing, dan Human Handoff.

Kemudian evaluasi kebutuhan asset tambahan seperti:

- Problem / Before vs After
- Configured Workspace Overview
- Demo Journey
- Business Message Processing Flowchart
- Human Handoff Flow
- Observability Trace
- AI Evaluation Matrix
- Cost Simulation / Unit Economics

Karena demo menggunakan workspace yang sudah dikonfigurasi, evaluasi apakah perlu ada satu visual yang menunjukkan workspace sebagai configuration hub, misalnya:

Workspace
├── Instructions
├── Knowledge
├── Tools
├── MCP / Shopify
├── WhatsApp
├── Evaluation
└── Users / access

Visual ini hanya digunakan jika benar-benar membantu audience memahami bahwa behavior AI berasal dari workspace configuration, bukan hanya dari hardcoded application logic.

Untuk setiap asset tentukan:

- Audience Question
- Presentation Section
- Purpose
- Required Information
- Information to Hide
- Abstraction Level
- Visual Type

Pilihan visual type:

- C4 System Context
- Architecture Diagram
- Flowchart
- Sequence Diagram
- State Diagram
- Trace Visualization
- Matrix
- Chart
- Dashboard

Pastikan setiap diagram memiliki satu tujuan yang jelas.

Hindari membuat banyak diagram hanya karena terlihat teknikal.

Untuk ketiga asset wajib:

- gunakan label singkat yang mengikuti istilah di `CONTEXT.md`;
- tampilkan hanya capability yang terbukti dan relevan untuk presentasi;
- jangan menggambarkan `ARCHITECTURAL INTENT` atau `RECOMMENDATION` seolah sudah berjalan;
- bedakan hubungan sinkron, asinkron, penyimpanan data, dan sistem eksternal secara konsisten;
- prioritaskan keterbacaan pada slide 16:9, bukan kelengkapan detail kode;
- gunakan bentuk, warna, dan arah alur yang konsisten;
- hindari teks kecil, dekorasi generatif, ikon ambigu, serta label yang tidak dapat diedit atau sulit dibaca;
- periksa ulang setiap component dan relationship terhadap evidence sebelum menyimpan PNG final.

Usulkan visual hierarchy yang konsisten untuk seluruh deck.

## Output

A. Required assets

B. Optional assets

C. Existing asset yang perlu direvisi

D. Assets yang sebaiknya tidak digunakan

E. Purpose setiap asset

F. Visual hierarchy

G. Common design language

H. Daftar koreksi yang diterapkan pada masing-masing asset lama

I. Evidence mapping untuk component dan relationship pada tiga asset utama

Simpan ke:

`docs/presentation-analysis/10-visual-assets.md`

Generate dan simpan asset final ke:

- `docs/presentation-analysis/prompts/System Context Diagram.png`
- `docs/presentation-analysis/prompts/System Architecture.png`
- `docs/presentation-analysis/prompts/AI Agent Architecture.png`
