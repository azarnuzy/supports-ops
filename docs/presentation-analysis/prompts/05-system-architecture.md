# 05 — High-Level System Architecture Analysis

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Jelaskan fungsi setiap komponen dengan bahasa biasa sebelum menyebut teknologi atau pola arsitekturnya.

Lakukan analisis **HIGH-LEVEL SYSTEM ARCHITECTURE** SupportOps.

Tujuan akhirnya adalah menjelaskan arsitektur sistem kepada engineering audience hanya dalam sekitar 2 menit.

Jangan membuat folder diagram.

Jangan membuat package dependency diagram.

Mulailah dari **RUNTIME BOUNDARIES**.

Identifikasi runtime component yang benar-benar ada seperti:

- Web Widget
- SupportOps Platform
- API Server
- AI Agent Runtime
- Worker
- Core Support Domain
- Redis / Queue
- PostgreSQL / pgvector
- Object Storage
- AI Provider
- Business System
- HTTP Tools
- MCP Servers
- Shopify integration melalui MCP jika benar-benar merupakan runtime boundary
- WhatsApp integration/channel
- External Systems
- Observability

Nama component harus mengikuti implementasi sebenarnya.

Analisis:

- synchronous request
- asynchronous processing
- data persistence
- AI boundary
- external integration boundary
- queue interaction
- human interaction
- trust/security boundary
- ownership data
- workspace/configuration boundary

Cari juga jalur komunikasi terpenting.

Jangan mengasumsikan hubungan sebelum memverifikasi source code.

Bandingkan dengan visual High-Level System Architecture yang sudah kita miliki secara konseptual.

Tentukan:

- component yang benar
- component yang harus digabung
- component yang tidak perlu muncul
- relationship yang berpotensi misleading
- istilah yang perlu diperbaiki
- apakah Shopify perlu muncul langsung atau cukup direpresentasikan sebagai MCP / External Business System
- apakah WhatsApp perlu muncul pada High-Level Architecture atau cukup pada System Context / Channel View

## Output

A. Runtime decomposition

B. Component responsibilities

C. Major data/request paths

D. Sync vs Async

E. External boundaries

F. Workspace/configuration boundary

G. Presentation-level architecture

H. Komponen yang harus disembunyikan

I. Koreksi terhadap diagram existing

J. Pertanyaan untuk deep-dive

Sertakan evidence file path.

Simpan ke:

`docs/presentation-analysis/05-system-architecture.md`
