# 05 — High-Level System Architecture

Analisis ini menyiapkan penjelasan arsitektur SupportOps untuk engineering audience dalam waktu sekitar 2 menit. Semua klaim diverifikasi dari source code, schema, konfigurasi deploy, dan ADR. Bagian yang berasal dari informasi project owner ditandai secara terpisah.

### Fakta dari project owner (dikonfirmasi 18 September 2026)

- **Business System demo tidak dipakai di production.** Perannya digantikan oleh **Shopify MCP Server**. Repo masih berisi kodenya (`apps/business-system`) dan `deploy/compose.prod.yaml` masih mendefinisikan containernya, jadi repo dan kenyataan berbeda di titik ini — yang dipakai adalah kenyataan.
- **Shopify MCP Server sudah terhubung** pada Workspace demo.
- **Telemetry menyala saat demo**, tetapi bukan hal yang perlu disorot. Yang disorot dari Observability hanyalah bagian **Evaluation**.

## Executive Findings

1. **Di production hanya ada dua program buatan sendiri yang benar-benar mengerjakan sesuatu**: API Server dan Worker. Ditambah dua bundel statis (Platform dan Web Widget) yang hanya disajikan sebagai file oleh web server. Sisanya infrastruktur (PostgreSQL, Redis) dan layanan pihak ketiga. Bukti: `deploy/compose.prod.yaml`, `Dockerfile`.
2. **"AI Agent Runtime" bukan program yang berdiri sendiri.** Ia adalah kumpulan kode (`packages/ai-agent`) yang dijalankan di dalam API Server untuk Web Widget, dan di dalam Worker untuk WhatsApp. Bukti: `apps/api/src/modules/widget/router.ts:148` memanggil `generateAiReply`, dan `apps/worker/src/whatsapp-turn.ts:3` mengimpor fungsi yang sama dari `@repo/api/ai-agent-turn`. Alasannya ditulis di `docs/adr/0019-whatsapp-reasoning-runs-in-the-worker.md`.
3. **"Core Support Domain" juga bukan komponen runtime.** Itu adalah modul di dalam API Server (`apps/api/src/modules/*`). Menggambarnya sebagai kotak sejajar dengan API Server membuat audience mengira ada service tambahan.
4. **Redis hanya satu.** Pada diagram sekarang Redis muncul dua kali (sebagai "Redis / Queue" dan sebagai "Redis"). Di production hanya ada satu container Redis yang memegang tiga peran: antrean pekerjaan (BullMQ), pub/sub untuk realtime, dan penghitung rate limit. Bukti: `deploy/compose.prod.yaml` (service `redis`), `apps/api/src/modules/widget/realtime.ts`, `apps/api/src/modules/widget/rate-limit.ts`.
5. **Business System tidak dipakai di production dan tidak perlu muncul di diagram.** Ia aplikasi demo di dalam repo ini (`apps/business-system`) yang memakai database PostgreSQL yang sama dengan schema terpisah, dan di production digantikan Shopify MCP Server. Kalau tetap ingin ditampilkan pada slide local/demo, labelnya harus **Demo Business System (in-repo)**, bukan *External*. Bukti: `apps/business-system/src/app.ts`, `apps/business-system/src/mcp.ts`; dikonfirmasi project owner.
6. **Shopify sudah terhubung, tetapi tidak ada satu baris pun kode Shopify.** Pencarian kata "shopify" di seluruh `apps/`, `packages/`, dan `scripts/` kosong. Shopify masuk sepenuhnya sebagai data konfigurasi: satu baris di tabel `McpServer` milik Workspace. Justru itu poin arsitekturnya — **sistem bisnis nyata tersambung tanpa mengubah kode**. Tampilkan Shopify sebagai contoh di dalam kotak MCP Server, bukan sebagai kotak sendiri.
7. **Diagram sekarang kehilangan hampir semua sistem eksternal yang nyata**: Meta WhatsApp Cloud API, Mistral (membaca PDF, gambar, dan suara), Tavily (mengambil isi halaman web), Resend atau SMTP (mengirim Session Link), Cloudflare R2, dan backend Observability. Semua ini dipanggil lewat jaringan publik dari API atau Worker.
8. **Observability di presentasi cukup diwakili Evaluation.** Pipeline trace-nya ada dan menyala saat demo, tetapi keputusan presentasi dari project owner: yang disorot adalah bukti kualitas jawaban (Evaluation), bukan tracing. Di diagram arsitektur, Observability boleh menjadi satu kotak kecil satu arah, atau dihapus dari versi 2 menit.

---

## A. Runtime decomposition

Yang dimaksud "runtime" di sini adalah sesuatu yang benar-benar berjalan sebagai proses atau layanan terpisah di production.

### Milik sendiri, berjalan di VPS

| Komponen | Apa yang dia lakukan | Bukti |
| --- | --- | --- |
| **Reverse Proxy (Caddy)** | Satu pintu masuk dari internet. Memasang HTTPS dan meneruskan tiga nama domain ke container yang benar. | `deploy/supports-ops.caddy`, `docs/adr/0007-vps-containers-over-cloudflare.md` |
| **SupportOps Platform** | Halaman web untuk Admin dan Human Agent. Disajikan sebagai file statis; semua datanya diambil dari API Server. | `Dockerfile` (stage `platform`), `apps/platform/package.json` |
| **Web Widget** | Kotak chat yang dipasang di website milik Workspace lewat satu tag script. Juga file statis. | `Dockerfile` (stage `widget`), `docs/adr/0006-shadow-dom-widget-isolation.md` |
| **API Server** | Satu-satunya program yang menerima permintaan dari luar: Customer, Human Agent, Admin, dan webhook WhatsApp. Menyimpan data, mengatur Ticket, dan **menjalankan AI Agent untuk Web Widget di dalam request itu sendiri**. | `apps/api/src/app.ts`, `apps/api/src/modules/widget/services.ts:386` |
| **Worker** | Mengerjakan semua yang tidak boleh membuat Customer menunggu: giliran AI untuk WhatsApp, pengiriman pesan WhatsApp, pengolahan Knowledge dan lampiran, timer Follow-Up, dan email Session Link. | `apps/worker/src/index.ts` |
| **Business System (demo)** — *tidak dipakai di production* | Aplikasi contoh berperan sebagai sistem bisnis milik Workspace: data customer, subscription, dan invoice lewat HTTP dan MCP. Di production perannya diambil Shopify MCP Server. | `apps/business-system/src/app.ts`; dikonfirmasi project owner |
| **PostgreSQL + pgvector** | Satu database untuk semua data produk, termasuk potongan Knowledge beserta embedding-nya. | `deploy/compose.prod.yaml` (image `pgvector/pgvector:pg16`), `packages/knowledge/src/vector-store.ts` |
| **Redis** | Satu Redis, tiga peran: antrean pekerjaan, pub/sub realtime, dan rate limit. | `apps/api/src/modules/widget/realtime.ts`, `apps/api/src/modules/widget/rate-limit.ts` |

### Di luar VPS, dipanggil lewat internet

| Sistem luar | Dipakai untuk apa | Dipanggil oleh | Bukti |
| --- | --- | --- | --- |
| **AI Provider (OpenRouter / completion gateway)** | Menjawab, mengklasifikasi, dan membuat embedding. | API dan Worker | `apps/api/src/config.ts` (`aiAgentConfig`, `classificationConfig`, `embeddingConfig`) |
| **Meta WhatsApp Cloud API** | Menerima pesan masuk (webhook) dan mengirim balasan. | API menerima, Worker mengirim | `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/worker/src/whatsapp-turn.ts:370` |
| **MCP Server milik Workspace** | Tool jarak jauh yang dikonfigurasi Admin. Pada Workspace demo ini adalah **Shopify MCP Server, dan sudah terhubung**. | API dan Worker | `apps/api/src/modules/mcp/client.ts`; status koneksi dikonfirmasi project owner |
| **Mistral** | Membaca isi PDF dan gambar, serta menuliskan isi pesan suara. | Worker | `apps/worker/src/attachment-process.ts:94`, `apps/worker/src/knowledge-ingest.ts:190` |
| **Tavily** | Mengambil isi halaman dokumentasi saat Knowledge Source berupa URL. | Worker | `apps/worker/src/knowledge-ingest.ts:294` |
| **Resend / SMTP** | Mengirim Session Link ke email Customer. | Worker | `apps/worker/src/session-email.ts` |
| **Cloudflare R2 (S3)** | Menyimpan lampiran dan file Knowledge. | API dan Worker | `packages/storage/src/index.ts`, `docs/adr/0007-vps-containers-over-cloudflare.md` |
| **Observability backend (Langfuse via OTLP)** | Menerima trace AI Agent. Menyala saat demo, tetapi bukan sorotan presentasi. Tujuannya konfigurasi, bukan arsitektur. | API dan Worker | `packages/logger/src/telemetry.ts`, `docs/adr/0010-otlp-observability-and-manual-evals.md` |

### Bukan runtime component

`packages/ai-agent`, `packages/knowledge`, `packages/channels`, `packages/tools`, `packages/storage`, `packages/logger` adalah library. Mereka ikut berjalan **di dalam** API atau Worker. Begitu juga "Core Support Domain": itu nama untuk modul-modul di `apps/api/src/modules/`.

---

## B. Tanggung jawab tiap komponen

**Web Widget** — mengambil konfigurasi tampilan, mengirim form Pre-Chat, mengirim pesan Customer, dan membuka satu koneksi SSE yang membawa semua kejadian: potongan jawaban AI, pesan Human Agent, dan perubahan status Ticket. Widget tidak pernah berbicara dengan Worker atau database. Bukti: `apps/api/src/modules/widget/router.ts` (`/config`, `/pre-chat`, `/messages`, `/events`).

**SupportOps Platform** — layar kerja Human Agent dan Admin: antrean Ticket, percakapan, Knowledge, Tool, MCP Server, pengaturan AI, WhatsApp, dan analitik. Juga memakai SSE untuk antrean dan untuk satu Ticket. Bukti: `apps/api/src/modules/tickets/router.ts:84` dan `:105`.

**API Server** — pintu masuk, penjaga izin, dan pemilik aturan support. Di dalamnya: autentikasi Workspace user (Better Auth), token Session untuk Widget, penyimpanan pesan, siklus hidup Ticket, otorisasi dan eksekusi Tool, klien MCP, serta webhook WhatsApp. Untuk Web Widget, API juga menjalankan giliran AI Agent secara langsung supaya token jawaban bisa mengalir ke browser yang sedang menunggu.

**Worker** — tujuh antrean berjalan di satu proses: `whatsapp-turn` (giliran AI dan pengiriman WhatsApp), `knowledge-ingest`, `attachment-process`, `ticket-follow-up` (Follow-Up, Auto-Resolution, Idle Closure), `ticket-knowledge-index`, `session-email`, dan `example`. Bukti: `apps/worker/src/index.ts:114-150`.

> `example` adalah sisa scaffolding dan tidak membawa fungsi produk. Jangan tampilkan di diagram.

**Business System (demo)** — memberi jawaban tentang customer, subscription, dan invoice. Perannya ganda dan berguna untuk local: satu endpoint HTTP biasa menjadi contoh **HTTP Tool**, dan endpoint `/mcp` menjadi contoh **MCP Tool**. Bukti: `scripts/seed-demo.ts:165` dan `:173`.

> Project owner mengonfirmasi bahwa di production komponen ini tidak dipakai; yang terhubung adalah Shopify MCP Server. Jadi di diagram production ia tidak muncul, dan yang muncul adalah satu kotak **MCP Server milik Workspace**.

**PostgreSQL** — satu database, dua schema. `public` untuk produk, `business_system` untuk aplikasi demo. Embedding Knowledge disimpan di tabel `Chunk` sebagai kolom vector, jadi pencarian makna dan data produk berada di mesin yang sama. Bukti: `apps/api/prisma/schema/*.prisma`, `packages/knowledge/src/vector-store.ts`, `docs/adr/0003-pgvector-over-qdrant.md`.

**Redis** — antrean BullMQ, pub/sub realtime (`supportops:ticket:*`, `supportops:ticket-queue:*`, `supportops:knowledge:*`), dan rate limit Widget.

---

## C. Jalur komunikasi terpenting

Empat jalur ini yang layak muncul di slide. Sisanya detail.

**1. Customer bertanya lewat Web Widget (paling cepat terlihat)**

Widget mengirim `POST /widget/messages` → API menyimpan pesan → API memanggil `generateAiReply` tanpa menunggu hasilnya (`void`) dan langsung membalas HTTP → AI Agent berjalan di dalam API: mengambil Knowledge dari pgvector, memanggil Tool bila perlu → setiap potongan jawaban diterbitkan ke Redis → API mengalirkannya ke browser lewat SSE. Bukti: `apps/api/src/modules/widget/router.ts:119-160`, `apps/api/src/modules/ai-agent/turn.ts`.

**2. Customer bertanya lewat WhatsApp**

Meta mengirim webhook → API memeriksa tanda tangan, menyimpan pesan, menaruh satu job tertunda 3 detik, lalu membalas 200 → Worker mengambil job, menjalankan AI Agent yang sama, lalu mengirim balasan ke Graph API Meta lewat job pengiriman terpisah. Penundaan 3 detik membuat beberapa bubble berturut-turut diperlakukan sebagai satu giliran. Bukti: `apps/api/src/modules/whatsapp-config/webhook.ts`, `apps/api/src/modules/whatsapp-config/queue.ts:36-49`, `apps/worker/src/whatsapp-turn.ts`.

**3. Human Agent mengambil alih Ticket**

Platform memanggil `POST /tickets/:id/claim` atau `/takeover` → API mengubah kepemilikan dengan update bersyarat di database → kejadian diumumkan lewat Redis pub/sub ke Widget dan ke antrean Platform. Setelah itu AI Agent tidak pernah berbicara lagi pada Ticket tersebut. Bukti: `apps/api/src/modules/tickets/router.ts:135-163`, `apps/api/src/modules/widget/realtime.ts:44` (`cancelTicketGeneration`), `apps/worker/src/whatsapp-turn.ts:56`.

**4. Admin menambah Knowledge**

Platform mengunggah file atau URL → API menyimpan ke R2 dan menaruh job → Worker mengambil isinya (Mistral untuk PDF, Tavily untuk URL), memotong teks, membuat embedding, dan menyimpan ke tabel `Chunk` → kemajuan tiap tahap diumumkan lewat Redis ke Platform. Bukti: `apps/worker/src/knowledge-ingest.ts`, `apps/api/src/modules/widget/realtime.ts:100`.

**Jalur kecil yang sering terlewat**: Worker memanggil balik API lewat `POST /internal/tickets/:id/generate` dengan token internal, setelah lampiran Web Widget selesai dibaca. Ini satu-satunya panggilan Worker ke API. Bukti: `apps/worker/src/attachment-process.ts:126-141`, `apps/api/src/app.ts:25-37`.

---

## D. Sync vs Async

**Synchronous (Customer atau user menunggu di depan layar)**
- Seluruh REST API Platform dan Widget.
- Giliran AI Agent untuk Web Widget. Ia berjalan di proses API, dilepas setelah response dikirim, dan hasilnya mengalir lewat SSE. Batas waktunya 60 detik per percobaan (`packages/ai-agent/src/turn.ts:27`).
- Panggilan Tool HTTP dan MCP: 15 detik, dengan satu kali ulang hanya untuk Tool yang tidak mengubah apa pun (`apps/api/src/modules/tools/execution.ts`, `apps/api/src/modules/mcp/client.ts:6`).

**Asynchronous (tidak ada yang menunggu)**
- Semua yang lewat antrean BullMQ: giliran WhatsApp, pengiriman WhatsApp, pengolahan Knowledge dan lampiran, timer Follow-Up / Auto-Resolution / Idle Closure, indeks Ticket, dan email.
- Percobaan ulang berbeda per jenis pekerjaan: pengiriman WhatsApp 6 kali dengan jeda menaik, giliran WhatsApp 5 kali. Kegagalan permanen tidak diulang dan dicatat sebagai gagal.

**Realtime bukan queue.** SSE dan Redis pub/sub hanya mengumumkan sesuatu yang sudah benar di database. Kalau client sedang putus, kebenaran tidak ikut hilang. Bukti: `docs/adr/0005-sse-for-realtime-single-widget-channel.md`.

---

## E. Batas ke sistem luar dan batas kepercayaan

**Siapa yang boleh masuk**
- Widget memakai token Session per percakapan, bukan akun. Ditambah pemeriksaan domain asal dan rate limit per token serta per alamat IP. Bukti: `docs/adr/0011-widget-requests-authenticate-by-session-token.md`, `apps/api/src/modules/widget/rate-limit.ts`.
- Platform memakai sesi Better Auth dan middleware Workspace. Bukti: `apps/api/src/modules/auth/middleware.ts`.
- Webhook WhatsApp diverifikasi dengan tanda tangan `x-hub-signature-256` memakai App Secret milik Workspace yang disimpan terenkripsi. Bukti: `apps/api/src/modules/whatsapp-config/webhook.ts:55-60`.
- Endpoint internal untuk Worker dijaga token statis `x-supportops-worker-token`. Bukti: `apps/api/src/app.ts:25`.

**Siapa yang boleh dipanggil keluar**
- MCP Server wajib HTTPS, tidak boleh membawa kredensial di URL, dan alamatnya tidak boleh mengarah ke jaringan internal. Redirect ditolak. Bukti: `apps/api/src/modules/mcp/client.ts:52-83`.
- HTTP Tool memakai penjagaan yang sama, ditambah batas ukuran hasil 64 KB dan timeout 15 detik. Bukti: `apps/api/src/modules/tools/execution.ts`, `apps/api/src/config.ts` (`httpToolConfig`).
- Tool yang mengubah data ditolak kecuali ada permintaan eksplisit dari Customer pada giliran itu; yang tidak bisa dibatalkan menuntut konfirmasi terpisah. Bukti: `apps/api/src/modules/tools/orchestration.ts:85-115`.
- Semua secret Tool dan WhatsApp disimpan terenkripsi dengan `TOOL_MASTER_KEY`. Bukti: `apps/api/src/modules/tools/secrets.ts`.

**Batas jaringan di production** — tiga network Docker: `proxy` (hanya API yang terhubung ke reverse proxy), `internal` (database dan Redis, tidak terbuka ke internet), dan `egress`. Postgres dan Redis tidak memiliki port yang dipetakan ke host. Bukti: `deploy/compose.prod.yaml`.

---

## F. Batas Workspace dan konfigurasi

Ini bagian yang paling sering hilang dari diagram, padahal ini inti produknya.

- Hampir semua tabel punya kolom `workspaceId`, dan penyaringannya dipasang otomatis lewat Prisma extension, bukan diingat satu per satu oleh developer. Bukti: `apps/api/src/utils/workspace-isolation.ts`, `docs/adr/0008-workspace-isolation-via-prisma-extension.md`.
- Workspace aktif dibawa dalam `AsyncLocalStorage`, jadi pekerjaan yang dijalankan Worker pun tetap berada dalam Workspace yang benar. Bukti: `apps/api/src/utils/workspace-context.ts`, dipakai di `apps/api/src/modules/ai-agent/turn.ts:38`.
- Query vector ditulis sebagai SQL mentah, sehingga melewati extension tadi. Karena itu setiap query di `packages/knowledge/src/vector-store.ts` menyaring `workspaceId` secara eksplisit, dan komentarnya menjelaskan hal ini.
- **Yang membuat satu Workspace berbeda dari Workspace lain semuanya adalah data, bukan kode**: `AiAgent.instructions`, `AiSettings`, Knowledge Sources, `Tool` + `ToolAssignment`, `McpServer` + `McpTool`, `WebWidgetConfig`, `WhatsAppConfig`, `TicketCategory`. Shopify pada Workspace demo hanyalah satu baris di `McpServer`.

Konsekuensinya untuk presentasi: menambah Workspace baru tidak menambah satu pun kotak di diagram.

---

## G. Arsitektur versi presentasi (target 2 menit)

Tampilkan tiga baris dan **maksimal sebelas kotak**. Urutan cerita: siapa yang memakai → apa yang menjawab → apa yang dipanggil.

**Baris 1 — Orang dan pintu masuk**
`Customer (Web Widget)` · `Customer (WhatsApp)` · `Human Agent & Admin (Platform)`

**Baris 2 — Sistem kita**
`API Server` (tertulis di dalamnya: *AI Agent berjalan di sini untuk Web*) · `Worker` (*AI Agent berjalan di sini untuk WhatsApp*) · `PostgreSQL + pgvector` · `Redis (Queue, Pub/Sub)` · `Object Storage (R2)`

**Baris 3 — Dunia luar**
`AI Provider` · `Meta WhatsApp Cloud API` · `MCP Server milik Workspace (Shopify)` — tambahkan `HTTP Tool` di kotak yang sama jika ingin menyebut kedua jenis Tool sekaligus.

**Panah yang wajib ada (arahnya satu arah, jangan dua arah):**
1. Web Widget → API (POST pesan) dan API → Web Widget (SSE).
2. Meta → API (webhook) dan Worker → Meta (balasan).
3. API → Redis (job) → Worker.
4. API dan Worker → PostgreSQL.
5. API dan Worker → AI Provider.
6. API dan Worker → Tool HTTP / MCP.
7. Redis pub/sub → API → Widget dan Platform (realtime).

**Kalimat pembuka dua menit:** "Semua yang masuk melewati satu API Server. Yang bisa dijawab sekarang dijawab sekarang; yang butuh waktu dilempar ke antrean dan dikerjakan Worker. AI Agent bukan server terpisah — ia potongan kode yang sama, dijalankan di API kalau ada browser yang menunggu, dan di Worker kalau tidak ada."

**Kalimat penutup untuk Shopify:** "Shopify tersambung lewat MCP. Tidak ada kode Shopify di sistem ini — Admin cukup mendaftarkan satu MCP Server di Workspace-nya."

**Catatan Observability:** pada versi 2 menit, Observability boleh tidak digambar sama sekali. Bukti operasional yang dibawa presentasi adalah **Evaluation**, dan itu punya slide sendiri.

---

## H. Komponen yang sebaiknya tidak muncul

| Jangan tampilkan | Alasan |
| --- | --- |
| **AI Agent Runtime sebagai kotak sendiri** | Bukan proses. Tulis sebagai label di dalam API dan Worker. |
| **Core Support Domain sebagai kotak sendiri** | Modul di dalam API Server. |
| **Redis dua kali** | Hanya ada satu Redis. |
| **Shopify sebagai kotak sendiri** | Tidak ada di source code; ia konfigurasi Workspace. Tulis di dalam kotak MCP Server: "MCP Server milik Workspace — Shopify". |
| **Business System demo** | Tidak dipakai di production (dikonfirmasi project owner). Tampilkan hanya jika slide tersebut memang membahas environment local. |
| **Observability sebagai lapisan besar** | Menyala saat demo, tetapi bukan sorotan. Maksimal satu kotak kecil satu arah, atau dihilangkan dari versi 2 menit. |
| **Better Auth, Prisma, Hono, BullMQ sebagai komponen** | Itu library, bukan batas runtime. Cukup jadi catatan kecil. |
| **Antrean `example`** | Sisa scaffolding tanpa fungsi produk. |
| **Eval runner dan cost script** | `apps/api/src/evals`, `scripts/cost-measure.ts` dijalankan manual, bukan bagian runtime. Punya slide sendiri. |
| **Nama package internal** | Diminta tidak membuat package dependency diagram, dan audience tidak membutuhkannya. |
| **Reverse Proxy** (opsional) | Boleh disembunyikan pada versi 2 menit; masukkan kembali jika membahas deployment atau TLS. |

---

## I. Koreksi terhadap diagram yang ada

**Komponen yang sudah benar**: Web Widget, SupportOps Platform, API Server, Worker, PostgreSQL + pgvector, Redis, Object Storage, AI Provider, MCP Servers, Observability, Customer / Human Agent / Admin.

**Harus digabung**
- "AI Agent Runtime" → masuk ke dalam API Server **dan** Worker.
- "Core Support Domain" → masuk ke dalam API Server.
- "Redis / Queue" + "Redis" → satu kotak Redis.

**Harus dipindah kategorinya**
- "Business System" sekarang berada di lapisan *External* dengan label "Hono service". Dua-duanya salah: ia bukan sistem eksternal, dan frameworknya tidak relevan. Karena di production ia tidak dipakai (digantikan Shopify MCP), **hapus saja kotaknya** dari High-Level Architecture. Jika ada slide khusus environment local, tampilkan sebagai **Demo Business System (in-repo)**.

**Relationship yang berpotensi menyesatkan**
1. `API Server ↔ AI Agent Runtime ↔ Core Support Domain` — menggambarkan panggilan antar service yang sebenarnya hanya pemanggilan fungsi dalam satu proses.
2. `PostgreSQL ↔ Redis` — tidak ada hubungan seperti itu di kode.
3. `Worker ↔ Core Support Domain` dua arah — yang benar: Worker memakai kode API dan database yang sama, ditambah satu panggilan HTTP internal untuk balasan lampiran.
4. Tidak ada satu pun panah ke Meta WhatsApp Cloud API, padahal itu batas eksternal paling ramai kedua setelah AI Provider.
5. Observability digambar sebagai lapisan yang tersambung ke banyak kotak dengan panah dua arah. Sebenarnya satu arah saja: API dan Worker mengirim trace keluar lewat OTLP. Pada diagram presentasi, lapisan ini lebih baik dikecilkan atau dihilangkan, karena sorotan Observability ada di Evaluation.
6. "Business System" digambar menerima panah dari Worker dan Core Support Domain. Di production komponen itu tidak berjalan, jadi panahnya menggambarkan sesuatu yang tidak terjadi.

**Istilah yang perlu diperbaiki**
- "Hono + Node.js + Prisma + Better Auth" pada API Server terlalu padat. Cukup "API Server — satu pintu masuk untuk semua permintaan".
- "Rnvia ± SDK" salah ketik; yang benar **Anvia SDK**, dan itu pun tidak perlu muncul di High-Level.
- "Redis — Queue and pub/sub" sudah tepat, tinggal ditambah "rate limit".
- "MCP Servers — External tools via MCP" sebaiknya menjadi "MCP Server milik Workspace", supaya jelas bahwa itu konfigurasi per Workspace.
- "Application Layer (Core)" berisi campuran proses dan modul. Ganti menjadi pembagian yang jujur: **sinkron (API)** dan **asinkron (Worker)**.

**Apakah Shopify perlu muncul langsung?**
Tidak sebagai kotak sendiri, tetapi namanya wajib disebut. Shopify sudah terhubung dan menjadi sumber jawaban commerce di demo, jadi menyembunyikannya sama sekali membuat diagram tidak mewakili kenyataan. Cara yang benar: satu kotak **"MCP Server milik Workspace — Shopify"**. Menaikkannya menjadi kotak setara API atau Worker akan membuat audience mengira ada integrasi khusus Shopify di dalam kode, padahal tidak ada satu baris pun. Bentuk inilah yang justru menjadi argumen arsitektur: sistem bisnis baru masuk sebagai konfigurasi, bukan sebagai rilis kode.

**Apakah WhatsApp perlu muncul di High-Level?**
Ya. WhatsApp bukan sekadar tampilan channel: ia memaksa bentuk sistem. Ia memasukkan permintaan lewat webhook ke API, memindahkan pekerjaan AI ke Worker, dan memiliki batas pengiriman sendiri ke Meta. Menyembunyikannya berarti menghilangkan alasan utama keberadaan Worker. Yang cukup di System Context saja adalah detail seperti Customer Service Window 24 jam dan Message Template.

---

## J. Pertanyaan untuk deep-dive

1. Apakah giliran AI Web Widget yang berjalan di dalam proses API pernah hilang saat deploy, dan apakah itu perlu disebut sebagai trade-off sadar di presentasi?
2. Tool Shopify mana saja yang sudah `enabled` dan di-assign ke AI Agent demo? Ini menentukan pertanyaan apa yang aman dipakai saat demo, bukan menentukan bentuk diagram.
3. Apakah Workspace demo masih memiliki HTTP Tool yang menunjuk Business System? Jika ya, Tool itu akan gagal di production dan sebaiknya dinonaktifkan sebelum presentasi.
4. Apakah Worker berjalan sebagai satu container tunggal? Dengan tujuh antrean di satu proses pada mesin 2 CPU, ini pertanyaan kapasitas yang mungkin ditanyakan audience.
5. Apakah antrean `example` dan service `business-system` boleh dihapus dari `deploy/compose.prod.yaml` sebelum presentasi, supaya repo dan production tidak lagi berbeda?

---

## Klasifikasi

| Hal | Status |
| --- | --- |
| API Server, Worker, PostgreSQL + pgvector, Redis, Object Storage, dan pemisahan sinkron/asinkron | **IMPLEMENTED** |
| AI Agent berjalan di dua proses (API untuk Web, Worker untuk WhatsApp) | **IMPLEMENTED** |
| Channel Web Widget dan WhatsApp, termasuk webhook, pengiriman, dan lampiran | **IMPLEMENTED** |
| Tool Built-in, HTTP, dan MCP beserta penjagaan keamanannya | **IMPLEMENTED** |
| Isolasi Workspace lewat Prisma extension dan filter eksplisit pada query vector | **IMPLEMENTED** |
| Business System | **DEMO / DEVELOPMENT INFRASTRUCTURE** — hanya untuk local; tidak dipakai di production (project owner) |
| MCP Server Shopify pada Workspace demo | **IMPLEMENTED** sebagai jalur MCP, dengan koneksi Shopify **sudah terhubung** (project owner). Daftar Tool yang aktif belum diverifikasi dari database |
| Observability lewat OTLP | **IMPLEMENTED** dan menyala saat demo (project owner), tetapi bukan sorotan presentasi |
| Eval suite dan cost measurement | **IMPLEMENTED**, dijalankan manual (`docs/adr/0010-otlp-observability-and-manual-evals.md`). Inilah bagian Observability yang disorot presentasi |
| Antrean `example` | **ARCHITECTURAL INTENT** / sisa scaffolding |

## Ketidakpastian yang masih perlu diverifikasi

- Daftar Tool Shopify yang benar-benar `enabled` dan di-assign ke AI Agent pada Workspace demo. Koneksinya sudah dipastikan; isinya belum dibaca dari database.
- Apakah Workspace demo masih menyimpan HTTP Tool yang menunjuk Business System, padahal container itu tidak berjalan di production.
- Apakah Resend atau SMTP yang dipakai di production untuk Session Link.
- `deploy/compose.prod.yaml` masih mendefinisikan service `business-system`. Perlu dipastikan apakah service itu memang tidak dijalankan, atau definisinya sudah usang dan sebaiknya dihapus.
