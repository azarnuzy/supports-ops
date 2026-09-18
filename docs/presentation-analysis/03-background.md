# 03 — Introduction & Background Analysis

Tanggal analisis: 18 September 2026  
Scope: pembukaan presentasi dan latar belakang masalah. Tahap ini belum membuat slide final.

## Executive Findings

Pembukaan sebaiknya dimulai dari satu kebutuhan Customer: mendapat jawaban yang cepat, benar, dan tetap bisa mencapai manusia ketika masalahnya tidak dapat diselesaikan oleh AI. Ini lebih kuat daripada membuka dengan LLM, RAG, MCP, atau arsitektur.

Masalah yang paling sesuai dengan kemampuan SupportOps bukan sekadar antrean yang panjang. Masalahnya adalah pemisahan antara percakapan, dokumen kebijakan, data bisnis langsung, tindakan pada sistem lain, dan pekerjaan Human Agent. Jika semua bagian itu tidak berada dalam satu alur, Customer dapat menerima jawaban tanpa sumber atau harus mengulang konteks saat berpindah ke manusia.

SupportOps mengubah alur tersebut dengan menempatkan AI Agent sebagai penangan pertama. AI Agent dapat memakai Knowledge yang sudah dipublikasikan dan Tool yang diizinkan. Jika AI tidak dapat melanjutkan dengan aman, Ticket masuk ke Shared Human Queue. Riwayat percakapan tetap ada dan ringkasan terbaru dibuat ketika Human Agent mengambil Ticket.

Framing ini merupakan **conceptual framing** yang didukung oleh capability project. Framing ini bukan bukti bahwa SupportOps selalu mempercepat Resolution, menurunkan biaya, atau meningkatkan kepuasan Customer. Klaim hasil seperti itu membutuhkan data eksternal atau pengukuran production.

## A. Problem statement

### Rumusan utama

> Customer support bukan hanya soal membalas pesan. Tim harus menemukan informasi yang benar, melihat kondisi Customer saat ini, menjalankan tindakan pada sistem bisnis, dan mengetahui kapan masalah harus ditangani manusia.

Ketika bagian-bagian ini terpisah, alur support memiliki friction:

1. Pesan masuk menunggu sampai Human Agent tersedia.
2. Human Agent perlu mencari kebijakan di dokumen yang berbeda.
3. Data seperti status subscription, invoice, atau order berada di sistem bisnis lain.
4. Perpindahan penanganan dapat membuat konteks percakapan hilang atau harus dibaca ulang.
5. Jawaban cepat belum tentu jawaban yang aman jika sumbernya tidak jelas.

Poin 1–4 adalah **conceptual framing** tentang pola kerja customer support. Poin tersebut masuk akal sebagai pengantar, tetapi bukan fakta yang telah diukur pada pengguna SupportOps. Jika dipresentasikan sebagai kondisi industri secara umum, klaimnya membutuhkan external evidence.

Poin 5 adalah risiko produk yang ditangani langsung oleh desain SupportOps. AI Agent diarahkan untuk memakai Customer-Safe Knowledge atau data langsung dari Tool. Jika tidak ada informasi yang memadai, sistem menyediakan jalur Escalation.

Evidence project:

- Keputusan AI Agent dapat berupa `REPLY`, `CLARIFY`, `ESCALATE`, atau `RESOLVE`: `packages/ai-agent/src/turn.ts`.
- AI Agent hanya berjalan selama Ticket berstatus `AI_HANDLING`: `apps/api/src/modules/ai-agent/turn.ts`.
- Knowledge dan data bisnis tersedia melalui Tool yang di-resolve untuk AI Agent: `apps/api/src/modules/tools/services.ts`, `apps/api/src/modules/tools/orchestration.ts`.
- Escalation mengubah status Ticket menjadi `ESCALATED` dan mencatat alasannya: `apps/api/src/modules/ai-agent/turn.ts`.
- Human Agent mengambil Ticket dari Shared Human Queue melalui Claim: `apps/api/src/modules/tickets/services.ts`.

### Masalah pada chatbot yang lebih sederhana

**Rule-based chatbot** cocok untuk pilihan dan alur yang sudah diketahui. Friction muncul ketika bahasa Customer bervariasi, pertanyaan membutuhkan konteks, atau kasus tidak sesuai cabang yang telah dibuat. Ini adalah **conceptual framing** dan membutuhkan external evidence jika dinyatakan sebagai gambaran industri.

**Simple LLM chatbot** dapat membuat percakapan terasa lebih alami, tetapi model saja tidak mengetahui dokumen mana yang resmi, data Customer yang sedang berlaku, Tool mana yang boleh dipakai, atau siapa yang harus melanjutkan kasus. Tanpa kontrol aplikasi, model juga tidak cukup untuk menjamin bahwa AI berhenti setelah manusia mengambil alih.

Bagian kedua sesuai dengan batas yang ditangani project. SupportOps menambahkan sumber, izin Tool, status Ticket, dan Escalation di luar model. Presentasi sebaiknya tidak mengatakan bahwa semua chatbot LLM pasti mengarang atau tidak aman.

## B. Product proposition

### Rumusan utama

> SupportOps menempatkan AI Agent sebagai penangan pertama dalam satu lifecycle customer support. AI memakai Knowledge dan Tool yang diizinkan untuk membantu Customer, lalu menyerahkan Ticket kepada Human Agent ketika tidak aman atau tidak cukup mampu untuk melanjutkan.

Empat unsur mempunyai fungsi yang berbeda:

- **Knowledge** memberi AI informasi perusahaan yang sudah dipublikasikan dan boleh dipakai untuk menjawab Customer.
- **Business Data** memberi kondisi langsung dari sistem milik perusahaan, misalnya status invoice atau subscription. Data ini masuk melalui Tool, bukan dari tebakan model.
- **Tools** menjadi akses terbatas untuk membaca data atau menjalankan tindakan di luar AI. AI Agent hanya dapat memakai Tool yang tersedia baginya.
- **Human Support** menangani kasus yang membutuhkan penilaian, informasi yang belum tersedia, kegagalan Tool, atau permintaan Customer untuk berbicara dengan manusia.

Kombinasi ini penting karena masing-masing tidak saling menggantikan. Knowledge tidak selalu memuat kondisi Customer saat ini. Business Data tidak menjelaskan seluruh kebijakan. Tool dapat gagal atau tidak boleh dipakai. AI juga tidak seharusnya memaksakan Resolution ketika batas tersebut tercapai.

### Fakta project

- Customer dapat masuk melalui Web Widget atau WhatsApp Channel.
- AI Agent membaca Agent Memory, Attachment yang sudah diproses, dan Tool yang tersedia.
- Built-in Knowledge search hanya mengambil Knowledge yang sesuai untuk Customer.
- HTTP Tool dan MCP Tool menghubungkan AI Agent dengan sistem di luar SupportOps.
- Tool yang mengubah data memiliki pemeriksaan tambahan terhadap permintaan Customer.
- Escalation menghentikan AI dari melanjutkan penanganan Ticket.
- Claim memindahkan Ticket kepada satu Human Agent dan menghasilkan Escalation Summary terbaru.

Evidence: `apps/api/src/modules/widget/services.ts`, `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/worker/src/whatsapp-turn.ts`, `apps/api/src/modules/ai-agent/turn.ts`, `apps/api/src/modules/tools/orchestration.ts`, `apps/api/src/modules/tools/services.ts`, `apps/api/src/modules/tickets/services.ts`, `packages/ai-agent/src/handoff.ts`.

## C. Before vs After model

Model ini adalah penyederhanaan untuk membuka presentasi. Ia menjelaskan perubahan alur kerja, bukan arsitektur lengkap.

### Before — traditional workflow

```text
Customer
   ↓
Queue
   ↓
Human Agent
   ↓
Knowledge documents + Internal Systems
   ↓
Reply / Resolve
```

Dalam model ini, Human Agent menjadi titik temu untuk semua pekerjaan: membaca pesan, mencari kebijakan, membuka sistem bisnis, mengambil tindakan, dan menulis balasan. Ini adalah **conceptual framing**, bukan hasil observasi terhadap satu organisasi tertentu.

### After — SupportOps

```text
Customer
   ↓
AI Agent
   ↓
Knowledge + Tools → Business System
   ↓
Reply / Resolve
   └──────── bila AI tidak dapat melanjutkan dengan aman ────────┐
                                                                  ↓
                                                        Shared Human Queue
                                                                  ↓
                                                            Human Agent
                                                                  ↓
                                                               Resolve
```

Perubahan utamanya bukan menghapus Human Agent. Perubahannya adalah memindahkan pencarian dan penanganan awal yang dapat dilakukan AI ke depan antrean, sambil mempertahankan jalur manusia di dalam lifecycle Ticket yang sama.

### Batas ketepatan model

- `Customer → AI Agent` benar untuk alur normal, tetapi Admin juga dapat melakukan Takeover saat AI masih menangani Ticket.
- `Knowledge + Tools` bukan langkah yang selalu keduanya terjadi. AI dapat memakai salah satu, keduanya, atau meminta penjelasan tambahan.
- `Resolve` bukan satu-satunya hasil. AI dapat membalas tanpa langsung menyelesaikan Ticket.
- Shared Human Queue muncul setelah Escalation. Setelah Claim, satu Human Agent menjadi pemilik Ticket.
- Channel tidak ditampilkan agar pembukaan tetap sederhana. Web Widget dan WhatsApp tetap merupakan pintu masuk yang nyata.

## D. 3–5 pesan penting

1. **Cepat saja tidak cukup.** Jawaban support juga harus berasal dari informasi yang tepat dan memiliki jalan menuju manusia.
2. **AI Agent tidak bekerja sendirian.** Knowledge memberi kebijakan, Tool memberi data atau tindakan, dan Human Agent menangani batas kemampuan AI.
3. **SupportOps mengelola lifecycle, bukan hanya chat.** Pesan, Ticket, status penanganan, Escalation, Claim, dan Resolution berada dalam satu alur.
4. **Human Handoff adalah bagian dari desain.** Ketika AI berhenti, konteks tidak dibuang. Ticket dan riwayatnya tetap tersedia bagi Human Agent.
5. **LLM adalah satu komponen.** Kontrol penting seperti status Ticket, izin Tool, visibilitas Knowledge, dan perpindahan ke manusia ditegakkan oleh aplikasi.

## E. Klaim yang harus dihindari

- “SupportOps menggantikan Human Agent.” Human Agent tetap menjadi bagian inti workflow.
- “Semua pertanyaan Customer langsung selesai oleh AI.” AI dapat meminta penjelasan, membalas tanpa menyelesaikan, atau melakukan Escalation.
- “AI selalu memberikan jawaban yang benar” atau “tidak pernah hallucinate.” Project memiliki kontrol dan Evaluation, bukan jaminan mutlak.
- “SupportOps menghilangkan antrean.” Shared Human Queue tetap ada untuk Ticket yang dieskalasi.
- “Handoff selalu tanpa friction.” Riwayat dan ringkasan tersedia, tetapi dampaknya terhadap waktu kerja manusia belum diukur.
- “Knowledge dan Tool menjamin jawaban selalu up to date.” Ketepatan tetap bergantung pada Knowledge yang dipublikasikan dan data dari sistem luar.
- “SupportOps mendukung semua Channel.” Yang berjalan saat ini adalah Web Widget dan WhatsApp. Channel lain adalah architectural intent.
- “MCP membuat semua sistem bisnis otomatis terhubung.” MCP Server harus dikoneksikan, Tool ditemukan, diaktifkan, dan tersedia bagi AI Agent.
- “Rule-based chatbot sudah tidak berguna.” Pendekatan tersebut masih dapat tepat untuk alur yang sempit dan tetap.
- “Simple LLM chatbot pasti tidak aman.” Risiko bergantung pada implementasi; bandingkan kemampuan sistem, bukan memberi label mutlak.

## F. Klaim yang membutuhkan external data

Klaim berikut tidak boleh disajikan sebagai fakta SupportOps tanpa sumber atau pengukuran tambahan:

- persentase pertanyaan support yang berulang;
- rata-rata waktu tunggu atau waktu Resolution pada customer support tradisional;
- dampak antrean terhadap kepuasan atau churn Customer;
- tingkat hallucination chatbot berbasis LLM;
- persentase Ticket yang dapat diselesaikan AI;
- pengurangan beban kerja, headcount, atau biaya support;
- peningkatan first response time, Resolution time, CSAT, atau SLA;
- perbandingan keberhasilan rule-based chatbot dengan AI Agent;
- nilai ROI atau payback period SupportOps;
- klaim bahwa Customer lebih menyukai AI atau selalu menginginkan Human Agent.

Jika external data tidak dipakai, ubah kalimat menjadi pertanyaan atau risiko desain. Contoh: “Bagaimana memberi jawaban cepat tanpa membiarkan AI menebak?” Kalimat ini tidak membutuhkan angka industri.

## G. Kandidat visual

### 1. Before vs After flow

Visual paling kuat untuk pembukaan. Tampilkan traditional workflow di kiri dan SupportOps di kanan. Gunakan cabang menuju Shared Human Queue agar Human Handoff tidak terlihat sebagai catatan kaki.

### 2. Empat sumber kemampuan

Tempatkan AI Agent di tengah dengan empat hubungan sederhana:

```text
Knowledge ───────┐
Business Data ───┼──→ AI Agent ───→ Customer
Tools ───────────┤          │
Human Support ───┘          └──→ Escalation bila perlu
```

Visual ini perlu diperbaiki pada tahap slide agar tidak memberi kesan Human Agent adalah input model. Makna yang benar: Human Support adalah jalur penanganan lanjutan.

### 3. One-Ticket journey

Satu garis waktu: pesan Customer → pencarian sumber → balasan AI → batas tercapai → Escalation → Claim → Resolution. Visual ini paling mudah disambungkan ke demo.

### 4. “Fast” dan “safe” sebagai dua kebutuhan

Dua kolom kecil: kecepatan berasal dari penanganan awal oleh AI; keamanan operasional berasal dari sumber, izin, status, dan jalur manusia. Gunakan hanya jika pembukaan membutuhkan satu gagasan sebelum diagram alur.

Rekomendasi awal: gunakan kandidat 1, lalu masuk ke demo melalui kandidat 3. Jangan menampilkan semua kandidat dalam presentasi final.

## H. Informasi yang belum perlu dijelaskan pada tahap ini

- LLM provider, model ID, token, dan reasoning effort.
- RAG, embedding, Chunk, pgvector, dan proses ingest Knowledge.
- Perbedaan teknis HTTP Tool dan MCP Tool.
- Aturan detail untuk Tool yang mengubah data.
- API, Worker, Redis, PostgreSQL, R2, container, dan deployment VPS.
- Session, Pre-Chat, Session Link, dan Customer Identity secara rinci.
- Aturan Follow-Up, Auto-Resolution, Idle Closure, dan WhatsApp Customer Service Window.
- AI Activity, Telemetry, Evaluation, dan Cost Runs. Semua penting, tetapi baru dijelaskan setelah audience memahami journey produk.
- Detail Attachment, OCR, transcription, retry, dan delivery status.
- Semua status Ticket dan seluruh Escalation Reason.
- Setup Workspace demo, Knowledge Source, Tool, atau MCP Server dari nol.

Pembukaan cukup menjelaskan Customer, AI Agent, Knowledge, Tool, Human Agent, dan Resolution. Istilah lain masuk ketika demo atau bagian teknis membutuhkannya.

## Implemented vs Partial vs Demo vs Intent

| Capability yang mendukung framing | Status | Dasar |
| --- | --- | --- |
| AI Agent sebagai penangan pertama pada lifecycle Ticket | **IMPLEMENTED** | `packages/ai-agent/src/turn.ts`, `apps/api/src/modules/ai-agent/turn.ts` |
| Pencarian Customer-Safe Knowledge | **IMPLEMENTED** | `apps/api/src/modules/tools/services.ts`, `packages/knowledge/src/vector-store.ts` |
| HTTP Tool dan MCP Tool | **IMPLEMENTED** | `apps/api/src/modules/tools/orchestration.ts`, `apps/api/src/modules/mcp/services.ts` |
| Escalation ke Shared Human Queue | **IMPLEMENTED** | `apps/api/src/modules/ai-agent/turn.ts`, `apps/api/src/modules/tickets/services.ts` |
| Claim dan Escalation Summary untuk Human Agent | **IMPLEMENTED** | `apps/api/src/modules/tickets/services.ts`, `packages/ai-agent/src/handoff.ts` |
| Web Widget dan WhatsApp sebagai Channel | **IMPLEMENTED** | `apps/api/src/modules/widget/services.ts`, `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/worker/src/whatsapp-turn.ts` |
| Konfigurasi Knowledge, HTTP Tool, Shopify MCP Tool, dan WhatsApp pada Workspace demo | **DEMO / DEVELOPMENT INFRASTRUCTURE** | Dikonfirmasi oleh project owner; isi spesifik perlu diverifikasi saat memilih demo |
| Channel tambahan di luar Web Widget dan WhatsApp | **ARCHITECTURAL INTENT** | Pemisahan Channel Adapter mendukung arah ini, tetapi Channel lain belum berjalan |

Tidak ada capability utama dalam framing pembukaan yang perlu disebut **PARTIALLY IMPLEMENTED**. Batas yang belum terbukti berada pada hasil bisnis, bukan pada alur dasar produk.

## Ketidakpastian yang masih perlu diverifikasi

- Skenario mana yang paling stabil untuk memperlihatkan Knowledge, Tool, dan Human Handoff dalam satu demo singkat.
- Knowledge Source dan Tool mana di Workspace demo yang menghasilkan bukti paling mudah dipahami audience.
- Apakah satu journey demo dapat berakhir dengan AI Resolution lalu dilanjutkan journey kedua untuk Human Handoff, atau cukup satu cabang utama.
- Bukti runtime mana yang akan ditampilkan untuk menunjukkan bahwa Human Agent menerima konteks terbaru.
- Apakah ada data internal yang dapat mendukung klaim efisiensi. Sampai ada, jangan membuat klaim tersebut.

## Kenapa hal ini penting untuk presentasi

Pembukaan ini memberi audience alasan untuk peduli sebelum melihat teknologi. Audience bisnis melihat perubahan cara kerja. Audience teknis mendapat pertanyaan yang akan dijawab oleh arsitektur: dari mana AI memperoleh fakta, bagaimana aksesnya dibatasi, dan apa yang terjadi saat AI gagal.

Framing juga menjaga posisi produk tetap akurat. SupportOps bukan chatbot mandiri dan bukan pengganti total tim support. Ia adalah workflow customer support yang memberi AI peran nyata dengan batas dan jalur manusia yang jelas.

## Pertanyaan untuk analisis lanjutan

1. Journey demo mana yang paling jelas membuktikan perbedaan antara Knowledge dan Business Data?
2. Di titik mana Escalation sebaiknya dipicu agar terlihat alami, bukan dibuat-buat untuk demo?
3. Bukti visual apa dari Activity Timeline atau Shared Human Queue yang cukup untuk menunjukkan continuity tanpa masuk terlalu cepat ke Observability?
4. Klaim hasil bisnis apa yang benar-benar dapat didukung oleh Cost Runs, Evaluation, atau data Ticket yang tersedia?
