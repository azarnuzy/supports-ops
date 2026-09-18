# 01 — Product & Repository Baseline Analysis

Tanggal analisis: 18 September 2026  
Scope: gambaran umum produk dan repository. Tahap ini belum membuat slide dan belum membahas detail setiap fungsi.

## Ringkasan Utama

SupportOps adalah aplikasi customer support yang menggabungkan AI dan tim support manusia dalam satu alur kerja. AI mencoba menangani pertanyaan Customer terlebih dahulu. Jika masalah tidak aman atau tidak bisa diselesaikan oleh AI, Ticket diteruskan ke Human Agent tanpa kehilangan riwayat percakapan.

Produk ini bukan hanya chatbot. Di dalamnya sudah ada Web Widget, pengelolaan Ticket, antrean Human Agent, Knowledge Base, koneksi ke sistem bisnis, dashboard, pencatatan aktivitas AI, proses background, tracing, dan AI evaluation. WhatsApp digunakan sebagai inbound support Channel: Customer memulai percakapan melalui WhatsApp, kemudian SupportOps membalas di thread yang sama.

Gambaran paling sederhana dari cara kerjanya adalah:

`Customer mengirim pesan → SupportOps mencatat percakapan → AI mencoba membantu → manusia mengambil alih bila diperlukan → Ticket diselesaikan`

Evidence utama: `CONTEXT.md`, `apps/api/src/app.ts`, `apps/api/src/modules/`, `packages/ai-agent/src/turn.ts`, `apps/worker/src/index.ts`.

### Kondisi Workspace demo yang dikonfirmasi project owner

Workspace demo sudah siap dipakai untuk menunjukkan lifecycle produk, bukan untuk mendemonstrasikan setup dari nol. Workspace ini sudah memiliki Knowledge yang published, HTTP Tool dan MCP Tool yang aktif, AI Instructions, Evaluation, user yang sesuai, serta konfigurasi WhatsApp. WhatsApp sudah dapat digunakan pada environment local dan production untuk memulai percakapan, mengirim chat, gambar, dan file, serta melanjutkan penanganan melalui Human Agent. Penggunaan token dan biaya model sudah diukur melalui Cost Runs.

Informasi ini berasal dari project owner dan menjadi acuan untuk strategi demo. Detail runtime serta hasil Evaluation dan Cost Runs tetap perlu dipilih pada tahap analisis berikutnya sebelum angka tertentu ditampilkan.

## A. Definisi SupportOps dalam 1–2 kalimat

SupportOps adalah platform customer support untuk perusahaan yang ingin memakai AI sebagai penangan pertama, tetapi tetap memberi jalan yang jelas kepada Human Agent ketika AI tidak dapat melanjutkan dengan aman. Semua percakapan, Ticket, Knowledge, Tools, dan user dipisahkan berdasarkan Workspace, sehingga data satu perusahaan tidak dapat dilihat oleh perusahaan lain.

Evidence: `CONTEXT.md`, `apps/api/prisma/schema/workspace.prisma`, `apps/api/src/utils/workspace-isolation.ts`.

### Kenapa ini penting untuk presentasi

SupportOps sebaiknya diperkenalkan sebagai sistem operasional customer support, bukan sebagai demo chatbot. Nilai produknya terletak pada perjalanan lengkap dari Customer berbicara dengan AI sampai masalah selesai oleh AI atau Human Agent.

## B. Problem yang ingin diselesaikan

Tim customer support menghadapi beberapa masalah yang saling berhubungan:

1. Banyak pertanyaan Customer berulang dan seharusnya dapat dijawab dengan cepat.
2. AI tidak boleh mengarang jawaban tentang kebijakan, akun, tagihan, atau data bisnis.
3. Ketika AI tidak bisa membantu, Customer harus diteruskan ke manusia tanpa mengulang penjelasan dari awal.
4. Tim support membutuhkan antrean kerja, pembagian Ticket, riwayat percakapan, dan status penyelesaian yang jelas.
5. Percakapan dapat datang dari lebih dari satu tempat, misalnya Web Widget dan WhatsApp.
6. Aktivitas AI perlu dapat diperiksa: Knowledge apa yang dicari, Tool apa yang dipanggil, kenapa Ticket diteruskan, berapa lama prosesnya, dan berapa biaya modelnya.

SupportOps menjawab masalah tersebut dengan cara berikut:

| Masalah | Solusi di SupportOps | Evidence |
| --- | --- | --- |
| Pertanyaan berulang membebani tim | AI Agent mencoba menjawab lebih dahulu | `packages/ai-agent/src/turn.ts` |
| AI dapat memberi jawaban yang tidak didukung data | AI mencari Knowledge yang sudah dipublikasikan atau data langsung dari Tool | `apps/api/src/modules/tools/services.ts`, `packages/knowledge/src/vector-store.ts` |
| AI tidak mampu menyelesaikan masalah | Ticket dipindahkan ke Shared Human Queue dengan alasan yang tercatat | `apps/api/src/modules/ai-agent/turn.ts`, `apps/api/src/modules/tickets/services.ts` |
| Human Agent kekurangan konteks | Sistem membuat Escalation Summary saat Ticket diambil | `apps/api/src/modules/tickets/services.ts`, `packages/ai-agent/src/handoff.ts` |
| Percakapan datang dari tempat berbeda | Web Widget dan WhatsApp memakai proses Ticket dan AI yang sama | `apps/api/src/modules/widget/services.ts`, `apps/worker/src/whatsapp-turn.ts` |
| Pekerjaan berat memperlambat request | Worker mengerjakan email, pemrosesan file, Knowledge, timer, dan WhatsApp di background | `apps/worker/src/index.ts` |

### Kenapa ini penting untuk presentasi

Cerita bisnisnya bukan “AI menggantikan semua Human Agent”. Cerita yang lebih tepat adalah “AI menangani pekerjaan awal dan pertanyaan yang dapat dijawab, sedangkan manusia tetap memegang masalah yang membutuhkan penilaian atau tindakan lebih lanjut.”

## C. Actor utama

| Actor | Apa yang dilakukan | Evidence |
| --- | --- | --- |
| Customer | Menghubungi support melalui Web Widget atau WhatsApp. Customer tidak memiliki akun SupportOps. | `CONTEXT.md`, `apps/api/src/modules/widget/services.ts`, `apps/api/src/modules/whatsapp-config/webhook.ts` |
| Admin | Mengatur Workspace, Human Agent, Web Widget, WhatsApp, Knowledge, AI, HTTP Tool, dan MCP Server. Admin juga dapat melihat semua Ticket dan mengambil alih Ticket dari AI. | `apps/platform/src/routes/`, `apps/api/src/modules/auth/guards.ts` |
| Human Agent | Melihat antrean bersama, mengambil Ticket, membalas Customer, meminta Suggested Reply dari AI, dan menyelesaikan Ticket. | `apps/api/src/modules/tickets/services.ts`, `apps/platform/src/features/chat/` |
| AI Agent | Membaca percakapan, mencari informasi, memanggil Tool, lalu memilih untuk menjawab, bertanya lagi, meneruskan ke manusia, atau menyelesaikan Ticket. | `packages/ai-agent/src/reply.ts`, `packages/ai-agent/src/turn.ts` |
| AI Copilot | Membantu Human Agent membuat draft balasan. Draft selalu diperiksa manusia dan tidak dikirim otomatis. | `packages/ai-agent/src/handoff.ts`, `apps/api/src/modules/tickets/services.ts` |
| Sistem bisnis eksternal | Menyediakan data langsung seperti customer, subscription, invoice, order, atau tindakan bisnis lain. | `apps/api/src/modules/tools/`, `apps/api/src/modules/mcp/` |

### Istilah dasar yang perlu dipahami

- **Workspace**: ruang kerja milik satu perusahaan. Semua data perusahaan dipisahkan di sini.
- **Session**: satu rangkaian percakapan Customer pada satu saluran komunikasi.
- **Ticket**: kasus support yang dibuat setelah Customer benar-benar menyampaikan masalah.
- **Knowledge Source**: dokumen atau informasi yang diberikan perusahaan kepada SupportOps sebagai bahan jawaban.
- **Tool**: kemampuan untuk mengambil data atau menjalankan tindakan di luar AI, misalnya mengecek invoice.
- **Channel**: tempat Customer menghubungi support, saat ini Web Widget dan WhatsApp.

Definisi lengkap berada di `CONTEXT.md`.

## D. Core capabilities

### 1. Customer Interaction

- Web Widget dapat dipasang pada website perusahaan.
- Customer mengisi nama dan email sebelum memulai percakapan Web.
- Customer dapat mengirim pesan dan Attachment.
- Balasan AI ditampilkan secara bertahap.
- Riwayat percakapan tetap dapat dibuka setelah Session selesai, tetapi menjadi read-only.
- WhatsApp digunakan untuk menerima percakapan dari Customer. Alurnya mendukung pesan masuk, Attachment, voice note, balasan AI, balasan Human Agent, dan status pengiriman.

Evidence: `apps/widget/src/widget.ts`, `apps/api/src/modules/widget/`, `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/worker/src/whatsapp-turn.ts`.

### 2. Support Operations

- Sistem menampilkan seluruh percakapan untuk Admin, termasuk percakapan yang belum menjadi Ticket.
- Ticket yang diteruskan oleh AI masuk ke Shared Human Queue.
- Human Agent dapat mengambil satu Ticket. Jika dua orang mengambil bersamaan, hanya satu yang berhasil.
- Admin dapat mengambil alih Ticket yang masih ditangani AI atau memberikan Ticket kepada Human Agent tertentu.
- Human Agent dapat membalas, mengirim Attachment, mencoba ulang pesan yang gagal, dan menyelesaikan Ticket.
- Status belum dibaca dicatat terpisah untuk setiap user.
- Dashboard menampilkan volume Ticket, Resolution, Escalation, status Ticket, Channel, dan beban Human Agent.

Evidence: `apps/api/src/modules/tickets/services.ts`, `apps/api/src/modules/tickets/router.ts`, `apps/platform/src/features/chat/`, `apps/api/src/modules/analytics/`.

### 3. AI Automation

- AI membedakan sapaan biasa dari permintaan support.
- Ticket baru dibuat setelah ada masalah support yang nyata.
- AI memberikan judul, kategori, dan prioritas awal pada Ticket.
- AI dapat memberikan empat hasil: menjawab, meminta penjelasan tambahan, meneruskan ke manusia, atau menyelesaikan Ticket.
- Jika Customer diam, sistem dapat mengirim Follow-Up dan menutup Ticket sesuai aturan waktu yang telah diatur.
- Setelah Ticket dimiliki manusia, AI tidak lagi mengirim pesan langsung kepada Customer.

Evidence: `packages/ai-agent/src/classification.ts`, `packages/ai-agent/src/turn.ts`, `apps/api/src/modules/ai-agent/turn.ts`, `apps/worker/src/follow-up.ts`.

### 4. Knowledge & Retrieval

Admin dapat menambahkan Knowledge dalam bentuk teks, PDF, atau URL. Worker kemudian membaca isinya, memecahnya menjadi bagian kecil, membuat representasi untuk pencarian berdasarkan makna, dan menyimpannya di PostgreSQL dengan pgvector.

Knowledge dibagi menjadi dua:

- **Customer-Safe**: boleh dipakai untuk menjawab Customer.
- **Internal-Only**: hanya boleh membantu Human Agent melalui AI Copilot.

Ticket yang telah selesai juga dapat menjadi sumber konteks untuk Customer yang sama pada Channel yang sama. Riwayat ini tidak dianggap sebagai kebijakan resmi perusahaan.

Evidence: `apps/api/src/modules/knowledge/services.ts`, `apps/worker/src/knowledge-ingest.ts`, `apps/worker/src/ticket-knowledge-index.ts`, `packages/knowledge/src/vector-store.ts`.

### 5. Tools & Integrations

AI dapat memakai tiga jenis Tool:

1. Pencarian Knowledge dan riwayat Ticket yang tersedia langsung di SupportOps.
2. HTTP Tool yang dikonfigurasi Admin untuk memanggil API eksternal.
3. Tool dari MCP Server yang ditemukan dan diaktifkan oleh Admin.

Admin menentukan Tool mana yang boleh dipakai oleh AI Agent. Sebelum menjalankan Tool yang mengubah data, sistem memeriksa apakah Customer benar-benar meminta tindakan tersebut. Untuk tindakan yang tidak dapat dibatalkan, Customer harus lebih dahulu mengonfirmasi tindakan yang telah dijelaskan AI.

Sistem juga memeriksa bentuk input, membatasi waktu dan jumlah pemanggilan dalam satu pesan Customer, menolak alamat jaringan yang tidak aman, dan membatasi ukuran hasil Tool.

Evidence: `apps/api/src/modules/tools/`, `apps/api/src/modules/mcp/`, `packages/ai-agent/src/tools.ts`, `packages/ai-agent/src/mutation-intent.ts`.

### 6. Human Handoff

Jika AI tidak dapat melanjutkan, Ticket dipindahkan ke manusia dan alasan perpindahannya disimpan. Ketika Human Agent mengambil Ticket, sistem mengirim pesan perkenalan kepada Customer dan membuat ringkasan terbaru berdasarkan seluruh percakapan sampai saat itu.

Human Agent juga dapat meminta Suggested Reply. AI Copilot boleh membaca Knowledge Internal-Only, tetapi hasilnya hanya menjadi draft dan tidak boleh dikirim tanpa tindakan manusia.

Evidence: `apps/api/src/modules/tickets/services.ts`, `packages/ai-agent/src/handoff.ts`, `apps/api/prisma/schema/enums.prisma`.

### 7. Data & Storage

- PostgreSQL menyimpan data utama aplikasi: Workspace, users, Session, Ticket, Message, Knowledge, konfigurasi Tool, dan aktivitas AI.
- pgvector di dalam PostgreSQL menyimpan data pencarian Knowledge.
- Redis dipakai untuk antrean pekerjaan dan pemberitahuan perubahan secara cepat.
- Cloudflare R2 dipakai sebagai penyimpanan file untuk Attachment, PDF Knowledge, dan aset lain yang disimpan melalui interface S3.

Evidence repository: `apps/api/prisma/schema/`, `packages/knowledge/src/vector-store.ts`, `packages/storage/src/index.ts`, `docs/adr/0003-pgvector-over-qdrant.md`, `docs/adr/0007-vps-containers-over-cloudflare.md`. Penggunaan Cloudflare R2 pada environment saat ini dikonfirmasi oleh project owner.

### 8. Background Processing

Worker menjalankan pekerjaan yang tidak perlu membuat Customer menunggu request HTTP, yaitu:

- mengirim Session Link melalui email;
- membaca dan mempublikasikan Knowledge;
- membaca Attachment;
- mengirim Follow-Up dan menutup Ticket yang tidak aktif;
- mengubah resolved Ticket menjadi Ticket Knowledge;
- memproses pesan dan pengiriman WhatsApp.

Evidence: `apps/worker/src/index.ts`, `apps/worker/src/knowledge-ingest.ts`, `apps/worker/src/attachment-process.ts`, `apps/worker/src/follow-up.ts`, `apps/worker/src/whatsapp-turn.ts`.

### 9. Observability

SupportOps memiliki dua jenis catatan yang berbeda:

- **AI Activity** adalah catatan produk yang dapat dilihat dari Ticket, misalnya klasifikasi, pencarian Knowledge, pemanggilan Tool, Escalation, Claim, dan Resolution.
- **Telemetry** adalah data teknis untuk developer, misalnya durasi proses, penggunaan token, dan urutan proses AI. Data ini dapat dikirim ke layanan yang menerima OpenTelemetry, seperti Langfuse.

Log aplikasi juga membawa ID trace agar error dapat dihubungkan dengan proses AI yang sedang berjalan. Isi prompt dan jawaban tidak dikirim secara default ketika mode aman digunakan.

Evidence: `apps/api/prisma/schema/ticket.prisma`, `packages/logger/src/index.ts`, `packages/logger/src/telemetry.ts`, `packages/ai-agent/src/telemetry.ts`.

### 10. AI Evaluation

Repository memiliki kumpulan skenario untuk memeriksa apakah AI:

- mengambil keputusan yang benar;
- memilih Tool yang benar;
- tidak membocorkan Knowledge Internal-Only;
- menjawab dalam bahasa yang sesuai;
- menemukan bagian Knowledge yang relevan;
- memberi jawaban yang sesuai dengan sumber;
- tetap memperlihatkan kegagalan melalui negative control.

Evaluation dijalankan secara manual terhadap Workspace yang sudah dikonfigurasi. Evaluation belum menjadi pemeriksaan otomatis pada setiap perubahan kode.

Evidence: `apps/api/src/evals/cases.ts`, `apps/api/src/evals/target.ts`, `apps/api/src/evals/metrics.ts`, `apps/api/src/evals/run.ts`, `docs/adr/0010-otlp-observability-and-manual-evals.md`.

## E. Major runtime components

### Aplikasi yang berjalan

| Aplikasi | Fungsi utama | Evidence |
| --- | --- | --- |
| Platform | Dashboard untuk Admin dan Human Agent | `apps/platform/` |
| Web Widget | Tampilan chat yang dipasang di website Customer | `apps/widget/` |
| API | Pusat aturan bisnis, autentikasi, Ticket, Web Widget, Knowledge, Tool, dan koneksi frontend | `apps/api/` |
| Worker | Menjalankan pekerjaan background dan proses WhatsApp | `apps/worker/` |
| Business System | Aplikasi demo terpisah untuk customer, subscription, invoice, HTTP Tool, dan MCP Tool | `apps/business-system/` |

### Infrastruktur produksi saat ini

Menurut konfigurasi repository dan informasi dari project owner:

- aplikasi dijalankan pada Tencent Cloud VPS;
- kapasitas VPS adalah 2 CPU core, RAM 4 GB, dan storage 60 GB;
- PostgreSQL, Redis, API, Worker, Platform, Widget, dan demo Business System dijalankan sebagai container;
- Cloudflare R2 menyimpan file sehingga file besar tidak menghabiskan disk VPS;
- model AI dan embedding dipanggil sebagai layanan eksternal;
- Telemetry production dapat dikirim ke Langfuse melalui OpenTelemetry.

Evidence repository: `deploy/compose.prod.yaml`, `Dockerfile`, `.github/workflows/ci-cd.yml`, `docs/adr/0007-vps-containers-over-cloudflare.md`, `docs/planning/tech-stack.md`. Spesifikasi Tencent VPS 2 core/4 GB/60 GB berasal dari project owner.

### Kenapa bentuk ini dipilih

Arsitektur ini disesuaikan dengan server kecil. PostgreSQL juga dipakai untuk pencarian vector agar tidak perlu menjalankan database vector terpisah. Platform dan Widget disajikan sebagai file statis. Attachment dipindahkan ke R2 agar RAM dan disk VPS dapat diprioritaskan untuk API, Worker, PostgreSQL, dan Redis.

## F. System boundaries

### Yang menjadi tanggung jawab SupportOps

- menyimpan Session, Ticket, Message, dan status penyelesaian;
- menentukan apakah AI masih boleh menjawab;
- membatasi data berdasarkan Workspace;
- mencari Knowledge yang boleh dilihat;
- mengatur akses AI terhadap Tool;
- mengelola antrean dan pekerjaan Human Agent;
- mencatat aktivitas penting dan Telemetry.

### Yang berada di luar SupportOps

| Sistem luar | Dipakai untuk | Evidence |
| --- | --- | --- |
| Website milik Customer | Tempat Web Widget dipasang | `apps/widget/src/loader.ts` |
| Meta WhatsApp Cloud API | Menerima dan mengirim pesan WhatsApp | `apps/api/src/modules/whatsapp-config/`, `apps/worker/src/whatsapp-turn.ts` |
| Model provider | Klasifikasi, jawaban AI, ringkasan, dan AI evaluation | `apps/api/src/config.ts`, `packages/ai-agent/` |
| HTTP API dan MCP Server | Mengambil data atau menjalankan tindakan pada sistem bisnis | `apps/api/src/modules/tools/`, `apps/api/src/modules/mcp/` |
| Cloudflare R2 | Menyimpan file melalui interface S3 | `packages/storage/`, `docs/adr/0007-vps-containers-over-cloudflare.md` |
| Email provider | Mengirim Session Link | `apps/worker/src/session-email.ts` |
| OCR, transcription, dan web extraction provider | Membaca PDF, gambar, voice note, dan website | `apps/worker/src/attachment-process.ts`, `apps/worker/src/knowledge-ingest.ts` |
| Langfuse atau layanan OpenTelemetry lain | Menampilkan trace dan hasil evaluation | `packages/logger/src/telemetry.ts` |

### Batas penting terkait WhatsApp Message Template

SupportOps tidak memiliki kebutuhan produk maupun fitur untuk mengelola WhatsApp Message Template. WhatsApp pada Workspace demo digunakan sebagai inbound support Channel: Customer memulai percakapan dan SupportOps membalas pada thread yang sama.

Implementation memang memiliki detail internal untuk kondisi pengiriman di luar Customer Service Window. Detail ini bukan capability yang perlu dijelaskan atau didemokan dalam presentasi baseline.

## G. Major end-to-end journeys

### G1. Customer mendapat jawaban dari AI melalui Web Widget

1. Customer mengisi nama dan email.
2. SupportOps membuat Session dan mengirim Session Link melalui email.
3. Sapaan biasa disimpan, tetapi belum membuat Ticket.
4. Ketika Customer menyampaikan masalah, SupportOps membuat Ticket dan memberi judul, kategori, serta prioritas.
5. AI mencari informasi yang dibutuhkan dan mengirim balasan secara bertahap.
6. Jika Customer menyatakan masalah sudah selesai, AI dapat menyelesaikan Ticket.
7. Percakapan ditutup dan dapat dibuka kembali dalam keadaan read-only.

Evidence: `apps/api/src/modules/widget/services.ts`, `apps/api/src/modules/ai-agent/turn.ts`, `packages/ai-agent/src/turn.ts`.

Status: **IMPLEMENTED**.

### G2. AI meneruskan Ticket kepada Human Agent

1. AI memutuskan tidak aman atau tidak mampu melanjutkan.
2. Sistem menyimpan alasan dan memindahkan Ticket ke Shared Human Queue.
3. AI berhenti mengirim pesan, tetapi pesan baru dari Customer tetap dicatat.
4. Human Agent mengambil Ticket.
5. Customer menerima pesan perkenalan dan Human Agent menerima ringkasan percakapan.
6. Human Agent dapat meminta draft balasan, mengirim jawaban, dan menyelesaikan Ticket.

Evidence: `apps/api/src/modules/ai-agent/turn.ts`, `apps/api/src/modules/tickets/services.ts`, `apps/platform/src/features/chat/`.

Status: **IMPLEMENTED**.

### G3. Admin mengambil alih dari AI

1. Admin melihat Ticket yang masih ditangani AI.
2. Admin memilih Takeover.
3. Proses AI dihentikan dan Ticket menjadi milik Admin.
4. Customer mendapat pemberitahuan bahwa manusia telah mengambil alih.
5. Admin dapat membalas dan menyelesaikan Ticket.

Evidence: `apps/platform/src/routes/chat/ai-live/`, `apps/api/src/modules/tickets/services.ts`, `apps/api/src/modules/tickets/router.ts`.

Status: **IMPLEMENTED**.

### G4. Admin menambahkan Knowledge

1. Admin menambahkan teks, PDF, atau URL dan memilih siapa yang boleh memakai isinya.
2. Worker membaca dan memproses sumber tersebut.
3. Status proses ditampilkan kepada Admin.
4. Setelah berhasil, Knowledge langsung dapat dicari oleh AI.
5. Versi lama tetap dapat dipakai jika pembaruan gagal sebelum versi baru siap.

Evidence: `apps/api/src/modules/knowledge/services.ts`, `apps/worker/src/knowledge-ingest.ts`, `packages/knowledge/src/vector-store.ts`.

Status: **IMPLEMENTED**.

### G5. AI mengambil data dari HTTP Tool atau MCP Tool

1. Admin menambahkan HTTP Tool atau MCP Server.
2. Admin meninjau dan mengaktifkan Tool untuk AI Agent.
3. AI memilih Tool berdasarkan pertanyaan Customer dan petunjuk Admin.
4. SupportOps memeriksa izin dan keamanan sebelum menjalankan Tool.
5. Hasil Tool diberikan kepada AI sebagai data, lalu AI menyusun jawaban atau meneruskan Ticket jika terjadi kegagalan.

Evidence: `apps/api/src/modules/tools/`, `apps/api/src/modules/mcp/`, `packages/ai-agent/src/tools.ts`.

Status: **IMPLEMENTED**. `apps/business-system` hanya menjadi contoh sistem bisnis untuk demo.

### G6. Customer berbicara melalui WhatsApp

1. Pesan masuk diterima dari Meta dan diperiksa keasliannya.
2. SupportOps menyimpan pesan dan menggabungkan beberapa bubble yang dikirim berdekatan menjadi satu giliran AI.
3. Worker menjalankan klasifikasi dan AI Agent.
4. Balasan dikirim kembali melalui Meta dan status pengirimannya dicatat.
5. Jika Ticket diteruskan, Human Agent menanganinya melalui antrean yang sama dengan Web Widget.
6. Aturan pengiriman WhatsApp tetap ditangani oleh Channel dan tidak mengubah lifecycle Ticket.

Evidence: `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/api/src/modules/whatsapp-config/queue.ts`, `apps/worker/src/whatsapp-turn.ts`, `packages/channels/src/index.ts`.

Status: **IMPLEMENTED** untuk WhatsApp sebagai inbound support Channel. Berdasarkan konfirmasi project owner, konfigurasi WhatsApp sudah aktif pada environment local dan production. Journey yang tersedia mencakup chat, gambar, file, dan penanganan lanjutan oleh Human Agent. Tidak ada fitur pengelolaan Message Template di SupportOps.

### G7. Customer tidak membalas

- Jika AI masih menangani Ticket, sistem dapat mengirim Follow-Up lalu menutup Ticket karena Customer tidak aktif.
- Jika Ticket sudah berada di antrean manusia atau sedang ditangani Human Agent, sistem menutupnya dengan alasan yang berbeda.
- Pesan baru dari Customer membatalkan timer lama.

Evidence: `apps/api/src/modules/follow-up/queue.ts`, `apps/worker/src/follow-up.ts`, `apps/worker/src/follow-up.db.test.ts`.

Status: **IMPLEMENTED**.

### G8. Riwayat Ticket membantu percakapan berikutnya

Ticket yang sudah selesai diproses menjadi sumber konteks. Pada percakapan baru, AI dapat menemukan riwayat tersebut hanya untuk Customer yang sama dan Channel yang sama.

Evidence: `apps/worker/src/ticket-knowledge-index.ts`, `packages/knowledge/src/vector-store.ts`.

Status: **IMPLEMENTED** pada code dan tests; live demo lengkap tetap perlu diverifikasi.

## H. Implemented vs Partial vs Demo vs Intent

| Capability | Status | Evidence / catatan |
| --- | --- | --- |
| Web Widget | **IMPLEMENTED** | `apps/widget/`, `apps/api/src/modules/widget/` |
| WhatsApp sebagai inbound support Channel | **IMPLEMENTED** | Customer dapat memulai percakapan; SupportOps memproses pesan/media dan mengirim balasan AI atau Human Agent. `apps/api/src/modules/whatsapp-config/`, `apps/worker/src/whatsapp-turn.ts` |
| Session, Ticket, Message, dan riwayat percakapan | **IMPLEMENTED** | `apps/api/prisma/schema/`, `apps/api/src/modules/widget/services.ts` |
| AI classification dan jawaban | **IMPLEMENTED** | `packages/ai-agent/src/` |
| Knowledge Base dan pencarian | **IMPLEMENTED** | `apps/api/src/modules/knowledge/`, `packages/knowledge/`, `apps/worker/src/knowledge-ingest.ts` |
| HTTP Tool | **IMPLEMENTED** | `apps/api/src/modules/tools/` |
| MCP Server dan MCP Tool | **IMPLEMENTED** | `apps/api/src/modules/mcp/` |
| Shared Human Queue, Claim, Handoff, reply, Resolution | **IMPLEMENTED** | `apps/api/src/modules/tickets/`, `apps/platform/src/features/chat/` |
| AI Copilot Suggested Reply | **IMPLEMENTED** | `packages/ai-agent/src/handoff.ts`, `apps/api/src/modules/tickets/services.ts` |
| Follow-Up dan penutupan otomatis | **IMPLEMENTED** | `apps/worker/src/follow-up.ts` |
| Dashboard | **IMPLEMENTED** | `apps/api/src/modules/analytics/`, `apps/platform/src/features/dashboard/` |
| AI Activity dan Telemetry | **IMPLEMENTED** | `apps/api/prisma/schema/ticket.prisma`, `packages/logger/` |
| Manual AI Evaluation | **IMPLEMENTED** | `apps/api/src/evals/` |
| Browser test untuk seluruh perjalanan produk | **PARTIALLY IMPLEMENTED** | Hanya satu Playwright flow utama. `apps/platform/e2e/mine-workspace.spec.ts` |
| Demo Workspace seed | **DEMO / DEVELOPMENT INFRASTRUCTURE** | `scripts/seed-demo.ts` |
| Demo Business System | **DEMO / DEVELOPMENT INFRASTRUCTURE** | `apps/business-system/` |
| Tambahan Channel baru selain Web dan WhatsApp | **ARCHITECTURAL INTENT** | Struktur code mendukung penambahan, tetapi belum ada Channel lain. `packages/channels/` |

WhatsApp Message Template Management dan email support tidak dimasukkan sebagai capability karena keduanya memang tidak tersedia. Email hanya dipakai untuk mengirim Session Link. AI Evaluation juga sengaja tidak menjadi pemeriksaan wajib di CI; keputusan ini tercatat di `docs/adr/0010-otlp-observability-and-manual-evals.md`.

### Perbedaan dokumentasi dengan implementation

| Topik | Dokumentasi lama | Kondisi yang terlihat dari code sekarang |
| --- | --- | --- |
| Production deployment | `README.md` menggambarkan Compose yang hanya berisi API dan PostgreSQL | `deploy/compose.prod.yaml` menjalankan seluruh aplikasi dan infrastruktur utama |
| Sumber data AI evaluation | `README.md` menyebut kumpulan data tetap di memory | `apps/api/src/evals/target.ts` menjalankan AI terhadap Workspace yang dipilih melalui `EVAL_WORKSPACE_ID` |
| Hasil keputusan AI | Architecture planning menyebut tiga hasil | Code sekarang memiliki empat hasil: answer, clarify, escalate, resolve |
| Business Tool | Architecture planning masih menggambarkan beberapa Tool tetap | Code sekarang mendukung Tool yang disimpan di database, HTTP Tool, MCP Tool, dan pengaturan per AI Agent |
| Batas pemanggilan Tool | `docs/feature-tracking.md` menyebut 3 pemanggilan/15 detik | Code memakai batas 15 pemanggilan/60 detik untuk satu pesan Customer |
| Human Agent UI | Bagian lama feature tracking menyebut UI belum ada | Platform sekarang sudah memiliki Shared Queue, My Tickets, All, dan AI-Live |
| Admin Resolve setelah Takeover | Walkthrough lama menyebut Admin harus memindahkan Ticket dahulu | Router dan service sekarang mengizinkan Admin yang menjadi pemilik Ticket untuk menyelesaikannya |
| WhatsApp Message Template | Beberapa dokumen dapat memberi kesan template adalah fitur Channel | Tidak ada pengelolaan template; hanya satu nama template pesan keluar yang ditulis langsung di code |
| Test coverage | Unit dan database tests cukup luas | Browser E2E masih sempit dan AI evaluation tidak berjalan di CI |

Actual implementation tetap menjadi acuan utama. Evidence: `docs/presentation-analysis/00-analysis-contract.md`.

## I. Technical differentiators yang menarik untuk presentasi

1. **AI dan Human Agent berada dalam satu perjalanan Ticket.** Customer tidak berpindah ke sistem lain ketika AI menyerahkan masalah.
2. **AI benar-benar berhenti setelah manusia mengambil alih.** Ini ditegakkan oleh status Ticket, bukan hanya instruksi dalam prompt.
3. **Percakapan dapat dimulai tanpa langsung membuat Ticket.** Sapaan tetap diingat, tetapi antrean support tidak dipenuhi percakapan kosong.
4. **Knowledge internal dipisahkan dari Knowledge yang boleh disampaikan kepada Customer.**
5. **HTTP Tool dan MCP Tool memakai izin per AI Agent.** Menambahkan Tool ke Workspace tidak otomatis memberi AI akses.
6. **Sistem membedakan keberhasilan nyata dari Customer yang hanya berhenti membalas.** Keduanya tidak dihitung sebagai hasil yang sama.
7. **Data aplikasi dan pencarian Knowledge berada di PostgreSQL yang sama.** Pilihan ini mengurangi kebutuhan server pada VPS 4 GB dan menjaga perubahan akses Knowledge tetap konsisten.
8. **Cloudflare R2 mengurangi beban storage VPS.** VPS dapat difokuskan untuk aplikasi, queue, dan database.
9. **AI Activity untuk kebutuhan operasi dipisahkan dari Telemetry untuk developer.**
10. **Evaluation memakai jalur AI yang sama dengan produk.** Evaluation tidak memakai salinan AI Agent yang berbeda.

Evidence: `apps/api/src/modules/tickets/services.ts`, `docs/adr/0017-agent-memory-belongs-to-the-session.md`, `packages/knowledge/src/vector-store.ts`, `apps/api/src/modules/tools/services.ts`, `docs/adr/0007-vps-containers-over-cloudflare.md`, `apps/api/src/evals/target.ts`.

## J. Area yang membutuhkan analisis lebih dalam

### Prioritas tinggi

1. **Alur pesan Web dan WhatsApp.** Perlu dibuat urutan yang lebih rinci dari pesan masuk sampai balasan tersimpan dan terkirim.
2. **Cara AI mengambil keputusan.** Perlu melihat instructions, memory, Knowledge, Tool, retry, timeout, dan alasan Escalation secara lebih mendalam.
3. **Keamanan dan pencatatan Tool.** Code menyimpan input dan hasil Tool yang dipotong ukurannya di AI Activity, sedangkan beberapa dokumen mengatakan hasil mentah tidak disimpan. Perbedaan ini perlu dipastikan sebelum menjadi materi presentasi. Evidence: `apps/api/src/modules/tools/orchestration.ts`.
4. **Workflow demo.** Workspace dan integrasinya sudah siap. Urutan journey yang paling kuat untuk presentasi akan ditentukan pada tahap analisis demo, bukan pada baseline. Evidence: `scripts/seed-demo.ts`, `apps/api/src/evals/cases.ts`, serta konfirmasi project owner.
5. **Hasil tracing dan evaluation yang nyata.** Capability tersedia, tetapi hasil run terbaru tetap perlu diperiksa sebelum menampilkan angka kualitas, waktu, atau biaya.
6. **Kesiapan WhatsApp.** Perlu membedakan code yang tersedia dengan kondisi nomor, webhook, token, dan template yang benar-benar aktif di Meta.

### Prioritas menengah

7. Kualitas pencarian Knowledge dan strategi pemecahan dokumen.
8. Pengalaman Human Agent pada kondisi error dan koneksi terputus.
9. Perhitungan biaya per Session dan per AI Turn.
10. Kapasitas Tencent VPS 2 core/4 GB/60 GB ketika traffic, jumlah Worker job, dan ukuran PostgreSQL bertambah.
11. Backup PostgreSQL, Redis recovery, serta lifecycle file di Cloudflare R2.
12. Penambahan browser E2E untuk journey selain Human Agent reply dan Resolution.

### Hal yang tidak boleh diklaim dalam presentasi saat ini

- SupportOps memiliki fitur pengelolaan WhatsApp Message Template.
- Email sudah menjadi Channel support.
- Semua Channel sudah siap production.
- Semua perjalanan produk sudah diuji otomatis dari browser.
- AI evaluation sudah menjadi syarat wajib deployment.
- Semua fitur pada dokumentasi lama masih sesuai dengan code terbaru.
- Spesifikasi VPS saat ini cukup untuk skala berapa pun; kapasitasnya belum diuji dalam analisis ini.

### Kandidat visual untuk tahap berikutnya — belum dibuat

- Gambaran sederhana perjalanan Customer dari AI ke Human Agent.
- Diagram aplikasi yang berjalan pada Tencent VPS dan layanan yang berada di luar VPS.
- Perbandingan Web Widget dan WhatsApp.
- Peta capability dengan status Implemented, Partial, Demo, dan Intent.
- Contoh satu Ticket lengkap beserta AI Activity dan Telemetry-nya.

## Ketidakpastian yang masih perlu diverifikasi

- Hasil Evaluation mana dari Workspace demo yang paling representatif untuk ditampilkan.
- Apakah Cloudflare R2, email provider, model provider, dan Telemetry backend sudah aktif pada environment demo.
- Cost Run mana yang paling representatif untuk menjelaskan penggunaan token dan biaya model.
- Bagaimana penggunaan resource VPS pada satu perjalanan demo nyata. Biaya sewa VPS tidak perlu dibahas.

Tidak ada test atau AI evaluation yang dijalankan dalam analisis baseline ini. Status capability ditentukan dari code, schema database, konfigurasi, seed, dan test definitions yang tersedia.

## Pertanyaan untuk analisis lanjutan

1. Workflow demo mana yang paling kuat untuk menghubungkan AI, Knowledge, Tool, WhatsApp, dan Human Handoff? Pertanyaan ini dibahas pada tahap analisis demo.
2. Hasil Evaluation, tracing, dan Cost Run mana yang akan digunakan sebagai bukti?
