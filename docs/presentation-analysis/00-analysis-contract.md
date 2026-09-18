# Kontrak Analisis Presentasi SupportOps

## Tujuan

Analisis repository digunakan untuk menyiapkan materi presentasi profesional berdurasi 15–20 menit bagi audience campuran: Software Engineer, Technical Lead / Architect, Product, dan Business Stakeholder.

Materi akhir harus menghubungkan BUSINESS, PRODUCT, DEMO, SYSTEM ARCHITECTURE, AI AGENT, OBSERVABILITY, EVALUATION, dan COST. Tahap ini belum membuat slide.

## Source of Truth

Urutan otoritas evidence:

1. Actual implementation dan runtime relationship.
2. Database schema, configuration, seed, dan scripts.
3. Tests dan Evaluation cases.
4. Dokumentasi serta Architecture Decision Records.
5. README.

Jika sumber-sumber tersebut berbeda, implementation menjadi acuan dan perbedaannya dicatat. Analisis tidak menggunakan internet atau asumsi eksternal kecuali diminta secara eksplisit.

Setiap klaim teknis penting harus menunjuk evidence yang dapat diperiksa, seperti file path, module, function/class, schema, configuration, test, atau hubungan runtime.

Informasi yang diberikan langsung oleh project owner adalah sumber utama untuk kondisi environment yang sedang dipakai. Bedakan informasi tersebut dari fakta yang ditemukan di repository.

## Fakta Environment yang Sudah Dikonfirmasi

- WhatsApp digunakan sebagai **inbound support Channel**: Customer memulai percakapan melalui WhatsApp dan SupportOps membalas di thread yang sama.
- SupportOps tidak memiliki fitur untuk membuat atau mengelola WhatsApp Message Template. Hanya ada satu template pesan keluar yang tetap untuk mengajak Customer membalas kembali setelah batas 24 jam.
- File disimpan di Cloudflare R2 melalui interface S3.
- Production berjalan pada Tencent Cloud VPS dengan 2 CPU core, RAM 4 GB, dan storage 60 GB.

Tetap periksa implementation untuk mengetahui bagian mana yang benar-benar terhubung dan dapat didemokan.

## Klasifikasi Capability

Setiap capability harus diberi tepat satu status berikut:

- **IMPLEMENTED** — tersedia dan benar-benar digunakan dalam source code.
- **PARTIALLY IMPLEMENTED** — implementasi tersedia tetapi belum lengkap.
- **DEMO / DEVELOPMENT INFRASTRUCTURE** — digunakan untuk demo, testing, development, atau simulasi.
- **ARCHITECTURAL INTENT** — arah desain terlihat, tetapi implementasinya belum lengkap.
- **RECOMMENDATION** — belum ada dan merupakan saran dari analisis.

Status tidak boleh dicampur. Recommendation harus dipisahkan dari fakta kondisi saat ini.

## Aturan Demo

Workspace demo yang sudah dikonfigurasi menjadi environment utama. Analisis demo berfokus pada lifecycle customer support end-to-end, bukan setup dari nol.

Keberadaan Shopify MCP Server, Tools, AI Instructions, Evaluation, User, WhatsApp configuration, dan konfigurasi Workspace lainnya harus diverifikasi dari implementation, seed, schema, tests, configuration, atau runtime flow. Nama atau dokumentasi saja tidak cukup untuk menyatakan sebuah capability aktif dan dapat didemokan.

## Fokus Analisis

Analisis memprioritaskan informasi yang membangun cerita presentasi:

- product value dan business relevance;
- keputusan System Architecture;
- AI orchestration, Retrieval, Tool Calling, dan MCP;
- deterministic guardrails, failure handling, serta Human Handoff;
- Observability dan Tracing;
- Evaluation dan batas validitasnya;
- operational cost dan bukti pengukurannya.

Detail kode yang tidak membantu audience memahami nilai produk, trade-off, risiko, atau alur sistem tidak dimasukkan.

## Struktur Setiap Hasil Analisis

Setiap analisis lanjutan di `docs/presentation-analysis/` menggunakan struktur:

1. Executive Findings
2. Evidence dari repository
3. Kenapa hal ini penting untuk presentasi
4. Hal yang sebaiknya tidak dimasukkan ke presentasi
5. Implemented vs Partial vs Demo vs Intent
6. Ketidakpastian yang masih perlu diverifikasi
7. Kandidat visual / diagram
8. Pertanyaan untuk analisis lanjutan

## Aturan Bahasa

Tulis dalam Bahasa Indonesia yang sederhana dan terdengar natural ketika dibacakan. Anggap pembaca memahami produk digital, tetapi belum mengenal codebase SupportOps.

- Mulai dari arti bisnis atau fungsi produk, kemudian jelaskan sisi teknisnya.
- Gunakan kalimat pendek. Satu kalimat sebaiknya menyampaikan satu gagasan utama.
- Jelaskan hubungan sebab-akibat secara langsung: apa yang terjadi, siapa yang melakukannya, dan kenapa itu penting.
- Gunakan kata sehari-hari jika maknanya tetap tepat. Contoh: “data disimpan” lebih mudah daripada “persistence”, “batas antar aplikasi” lebih mudah daripada “runtime boundary”, dan “kumpulan data tetap” lebih mudah daripada “fixed in-memory corpus”.
- Istilah teknis English boleh digunakan ketika memang merupakan nama konsep di SupportOps, misalnya AI Agent, Human Agent, Ticket, Workspace, Knowledge, Tool, MCP, Worker, Queue, Observability, dan Evaluation.
- Jelaskan istilah teknis secara singkat saat pertama kali digunakan. Setelah itu, gunakan istilah yang sama secara konsisten.
- Hindari menumpuk banyak jargon dalam satu kalimat. Pecah penjelasan menjadi beberapa kalimat atau contoh alur.
- Jangan memakai istilah seperti “multi-tenant”, “grounded answer”, “intrinsic Tool”, “explicit-intent guard”, atau “SSRF protection” tanpa langsung menjelaskan artinya dalam bahasa biasa.
- Bedakan dengan jelas antara fakta dari repository, informasi dari project owner, dan asumsi yang masih perlu diperiksa.
- Tabel hanya digunakan jika benar-benar membuat perbandingan lebih mudah dipahami.

Hasil yang benar secara teknis tetapi sulit dipahami belum dianggap selesai. Sebelum menyimpan, baca ulang setiap bagian dan sederhanakan kalimat yang terasa seperti dokumentasi internal engineer.

## Batasan Kerja

- Tidak membuat slide sebelum seluruh tahap analisis dan verifikasi selesai.
- Tidak melakukan code review sebagai tujuan utama.
- Tidak memodifikasi application source code.
- Tidak menyatakan Architecture Intent sebagai capability yang sudah berjalan.
- Selalu menjawab: **kenapa informasi ini penting untuk audience?**
