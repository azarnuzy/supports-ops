# Feature Tracking

Status fitur dan halaman yang dapat dicoba pada SupportOps. Perbarui dokumen
ini pada saat GitHub issue yang mengubah status fitur ditutup.

Status yang dipakai:

- **Siap dicoba** — alur utama sudah terhubung dan dapat digunakan di lingkungan lokal dengan prasyaratnya.
- **Sebagian siap** — UI atau fondasi sudah ada, tetapi alur produk belum lengkap.
- **Belum tersedia** — belum dapat dipakai sebagai fitur produk.

## Prasyarat lokal

| Kebutuhan | Dipakai untuk |
| --- | --- |
| Postgres | Seluruh data aplikasi |
| Redis dan Worker | Publish Knowledge Source serta pengiriman email Session Link |
| `OPENROUTER_API_KEY` | Embedding saat publish Knowledge Source dan Retrieval test |
| S3-compatible object storage, `MISTRAL_API_KEY`, dan `INTERNAL_WORKER_TOKEN` | Mengunggah dan membaca Attachment dari Web Widget |
| Domain pada allowlist Web Widget | Memuat widget dari website tersebut |

## Halaman Platform

| Halaman | Akses | Status | Yang dapat dicoba | Batasan saat ini |
| --- | --- | --- | --- | --- |
| `/register`, `/login` | Publik | Siap dicoba | Membuat akun Workspace, masuk, dan keluar. | — |
| `/` | Pengguna masuk | Siap dicoba | Admin melihat angka Workspace di dashboard: resolusi AI terpisah antara konfirmasi Customer dan Customer tidak aktif (tidak pernah digabung menjadi satu angka), tingkat eskalasi ke manusia dengan penyebut yang sama, sebaran status Ticket saat ini, rincian Ticket per Channel, dan jumlah Ticket aktif per Human Agent. Human Agent melihat tautan ke Inbox, Shared Queue, dan My Tickets. | Angka mencakup seluruh Ticket pada Workspace tanpa filter periode; belum ada tren historis. |
| `/profile` | Pengguna masuk | Siap dicoba | Mengubah nama tampilan dan URL avatar. | — |
| `/settings/agents` | Admin | Siap dicoba | Membuat Human Agent dan melihat daftar Human Agent dalam Workspace. | Belum ada pengelolaan lanjutan seperti edit/nonaktifkan akun. |
| `/settings/widget` | Admin | Siap dicoba | Mengatur nama AI, pesan sambutan/penutup, warna, domain yang diizinkan, preview, dan embed snippet. | Pesan penutup dipakai saat Human Agent melakukan Resolution. |
| `/settings/ai` | Admin | Siap dicoba | Mengatur jeda Follow-Up, jeda Auto-Resolution, dan menyalakan atau mematikan Auto-Resolution. Nilai memakai detik sehingga alur dapat dicoba dengan cepat di lokal. | Pengaturan hanya berlaku untuk Ticket yang masih ditangani AI Agent; perubahan tidak menjadwalkan ulang timer yang sudah aktif. |
| `/knowledge` | Admin | Siap dicoba | Membuat, mengubah, menghapus, dan publish Manual FAQ; memilih Customer-Safe atau Internal-Only; menjalankan Retrieval test. Status pemrosesan Knowledge Source (Draft/Processing/Ready/Published/Failed, termasuk alasan kegagalan) terlihat real-time di daftar tanpa perlu refresh halaman, via SSE. | Hanya Manual FAQ. Sumber yang dipublish Customer-Safe dipakai oleh AI Agent di Web Widget; Internal-Only tidak pernah dipakai untuk balasan Customer. Belum ada tombol retry dari UI untuk sumber yang Failed. |
| `/chat` | Pengguna masuk | Sebagian siap | Vertical slice pertama dari Unified Ticket Workspace ([#43](https://github.com/azarnuzy/supports-ops/issues/43)): melihat Ticket pada scope Mine (milik sendiri), membuka Ticket di URL stabil `/chat/tickets/:ticketId` (bertahan saat refresh), membaca transcript, Escalation Summary, dan Attachment; meminta Suggested Reply secara eksplisit (draft kosong diisi; draft yang ada memberi pilihan Replace atau Insert below); serta mengirim balasan idempoten dengan status Sending/Sent/Failed dan Retry. Resolution mencatat alasan `HUMAN_RESOLVED`, menunggu pengiriman yang pending, mengingatkan bahwa Ticket tidak dapat dibuka kembali, lalu membuat transcript read-only. Attachment JPG/PNG dapat dibuka dalam galeri; PDF/TXT dapat dipratinjau atau diunduh setelah otorisasi Ticket. | Baru mencakup scope Mine; belum ada scope Unassigned/All atau operasi Admin di halaman ini ([#45](https://github.com/azarnuzy/supports-ops/issues/45)–[#47](https://github.com/azarnuzy/supports-ops/issues/47)). Attachment membutuhkan object storage; unggah dan ekstraksi juga membutuhkan Worker, `MISTRAL_API_KEY`, dan `INTERNAL_WORKER_TOKEN`. Suggested Reply membutuhkan `OPENROUTER_API_KEY` dan Knowledge Source yang telah dipublish. Pengiriman retry hanya berlangsung pada proses API yang sama; belum ada antrean retry lintas-proses. Route `/tickets*` tetap tersedia sampai workspace baru mencapai feature parity ([#53](https://github.com/azarnuzy/supports-ops/issues/53)). |
| `/tickets/queue` | Human Agent, Admin | Siap dicoba | Melihat Shared Human Queue escalated secara oldest-first; Human Agent dapat Claim dan Admin dapat memilih Human Agent untuk menugaskan Ticket. Admin juga dapat memantau Ticket yang masih ditangani AI secara live dan melakukan Takeover. Perubahan queue masuk otomatis tanpa refresh halaman. | Belum ada detail Ticket atau balasan Human Agent dari halaman ini. |
| `/tickets/mine` | Human Agent, Admin | Siap dicoba | Melihat percakapan Ticket yang telah di-Claim atau di-Takeover, meminta Suggested Reply dari AI Copilot, mengeditnya, mengirim balasan, dan melakukan Resolution. Pesan Customer serta perubahan Ticket masuk otomatis tanpa refresh. | Suggested Reply membutuhkan `OPENROUTER_API_KEY` dan Knowledge Source yang telah dipublish. |
| `/gallery` | Pengguna masuk | Siap dicoba | Melihat komponen visual dan status Ticket untuk referensi desain. | Hanya galeri komponen, bukan fitur operasional. |

## Web Widget

| Kemampuan | Status | Yang dapat dicoba | Batasan saat ini |
| --- | --- | --- | --- |
| Memuat widget dari embed snippet | Siap dicoba | Pasang snippet pada domain yang diizinkan, lalu buka launcher. | Widget ditolak dari domain di luar allowlist. |
| Pre-Chat dan Web Session | Siap dicoba | Customer mengisi nama dan email untuk memulai Web Session. | Email Session Link membutuhkan Redis, Worker, dan konfigurasi layanan email. |
| Mengirim pesan Customer dan balasan AI Agent | Siap dicoba | Pesan pertama membuat Ticket; AI Agent mengambil Knowledge Source Customer-Safe yang sudah dipublish lalu membalas dalam bahasa Customer. Balasan muncul bertahap melalui SSE dan input terkunci selama generasi. Saat Customer mengonfirmasi masalahnya sudah selesai, dalam bahasa apa pun, AI Agent melakukan Resolution otomatis; sekadar ucapan terima kasih tidak dianggap konfirmasi, dan bila maksud Customer tidak jelas AI Agent bertanya dulu apakah masalahnya sudah selesai. | Jika tidak ada sumber yang mendukung jawaban, generasi gagal dua kali, atau permintaan tetap ambigu setelah dua klarifikasi, Ticket dieskalasi; belum ada UI Human Agent untuk menanganinya. Membutuhkan `OPENROUTER_API_KEY`, Postgres, Redis, Worker, dan Knowledge Source Customer-Safe yang dipublish. |

## Alur support yang belum tersedia

| Fitur | Status |
| --- | --- |
| AI Agent menjawab dari Customer-Safe Knowledge | Siap dicoba di Web Widget; lihat prasyarat dan batasan di atas. |
| Escalation dan Shared Human Queue | Siap dicoba di Web Widget — minta Human Agent secara natural dalam Bahasa Indonesia atau Inggris, atau kirim pertanyaan tanpa Knowledge Source Customer-Safe yang relevan. Ticket berpindah ke `ESCALATED`, menyimpan alasan baku dan AI Activity, lalu Customer menerima acknowledgement; pesan Customer berikutnya tetap tercatat tanpa balasan AI. Memerlukan prasyarat Web Widget dan, untuk escalation berbasis knowledge, konfigurasi AI Agent. Belum ada UI Shared Human Queue, Claim, atau Takeover untuk Human Agent. |
| Claim | Siap dicoba — Human Agent dapat Claim Ticket dari Shared Human Queue; update kondisional memastikan satu Claim menang bila dua Human Agent mencoba bersamaan. Admin dapat menugaskan Ticket kepada Human Agent lain. Membutuhkan Postgres dan Redis, serta Ticket yang sudah dieskalasi. |
| Handoff dan Escalation Summary | Siap dicoba — setelah Human Agent Claim Ticket, Customer menerima pengenalan yang menyebut nama Human Agent melalui SSE, dan Escalation Summary baru dibuat dari percakapan serta AI Activity saat itu. Ringkasan muncul otomatis di `/tickets/mine`; bila pembuatan gagal, Claim tetap berlaku dan Human Agent melihat pemberitahuan untuk meninjau percakapan langsung. Membutuhkan prasyarat Claim dan `OPENROUTER_API_KEY` untuk menghasilkan ringkasan. |
| Takeover | Siap dicoba — Admin dapat memantau Ticket yang sedang ditangani AI di `/tickets/queue`, lalu mengambil alih. Streaming AI yang sedang berlangsung dihentikan tanpa menyimpan balasan parsial; Ticket menjadi milik Admin, Customer menerima pengenalan, dan AI hanya dapat dipakai sebagai Copilot. Membutuhkan Postgres dan Redis serta Ticket Web Widget yang sedang berstatus `AI_HANDLING`; Follow-Up dan Auto-Resolution yang masih menunggu dibatalkan. |
| Human Agent membalas dan melakukan Resolution | Siap dicoba — Human Agent yang memiliki Ticket dapat membalas dari `/tickets/mine`; pesan langsung masuk melalui kanal SSE Web Widget yang sama dan Customer dapat membalas tanpa refresh. Resolution mengirim pesan penutup Workspace, mencatat `HUMAN_RESOLVED`, menutup Web Session, serta menjadikan transkrip pada Widget read-only dengan tombol untuk memulai percakapan baru. Membutuhkan prasyarat Web Widget, Postgres, dan Redis. Pengiriman outbound disimpan dengan status dan dicoba hingga tiga kali; belum ada antrean retry lintas-proses. |
| AI Copilot dan Suggested Reply | Siap dicoba — Human Agent pemilik Ticket dapat meminta Suggested Reply dari `/tickets/mine`; draft memakai Customer-Safe dan Internal-Only Knowledge, Business Tool data, konteks Ticket sebelumnya dari Customer Identity yang sama, serta percakapan saat ini. Draft masuk ke editor untuk ditinjau atau diubah; tidak pernah terkirim otomatis. Membutuhkan `OPENROUTER_API_KEY`, Postgres, Business System, dan Knowledge Source yang dipublish. Internal-Only Knowledge hanya menjadi konteks dan kutipan lima kata atau lebih dari sana ditolak. |
| AI Agent melakukan Resolution saat Customer konfirmasi | Siap dicoba di Web Widget — saat AI Agent masih menangani Ticket dan Customer memberi konfirmasi yang jelas bahwa masalahnya sudah selesai (dalam Bahasa Indonesia atau Inggris), AI Agent mengirim pesan penutup Workspace, mencatat `CUSTOMER_CONFIRMED` sebagai `resolvedBy` AI Agent, menutup Web Session, dan mencatat AI Activity `RESOLVED`. Sekadar ucapan terima kasih tidak memicu Resolution; bila maksud tidak jelas AI Agent bertanya dulu. Membutuhkan `OPENROUTER_API_KEY`, Postgres, dan Redis. |
| Follow-Up dan Auto-Resolution | Siap dicoba — Admin mengatur jeda Follow-Up, jeda Auto-Resolution, dan sakelar Auto-Resolution di `/settings/ai` (nilai dalam detik agar mudah diuji lokal). Setelah balasan AI, Customer yang diam menerima satu Follow-Up yang merujuk judul Ticket; jika tetap diam setelahnya, Ticket ditutup sebagai `CUSTOMER_INACTIVE`. Pesan Customer membatalkan timer, balasan AI baru mengganti timer, dan Ticket yang di-Claim atau di-Takeover tidak pernah menjalankannya. Membutuhkan Postgres, Redis, API, Worker, serta Ticket Web Widget yang ditangani AI. Auto-Resolution yang dimatikan tetap mengizinkan Follow-Up tetapi tidak menutup Ticket. |
| Activity Timeline dan UI AI Activity | Belum tersedia |
| Business Tools | Sebagian siap — AI Agent dapat membaca Customer, Subscription, dan Invoice dari Business System terpisah; kegagalan tool serta permintaan perubahan langganan/refund dieskalasi. Jalankan Postgres dan Business System (`docker compose -f docker-compose.dev.yaml up -d`) serta gunakan Customer demo `budi@example.com` atau `siti@example.com`. Belum ada UI Admin untuk melihat AI Activity atau mengelola data Business System. |
| Attachment | Siap dicoba di Web Widget dan workspace `/chat` — kirim PDF, plain text, JPEG, atau PNG (maks. 10 MB) bersama konteks singkat; status processing terlihat dan teks hasil ekstraksi menjadi konteks Ticket untuk balasan AI. Di `/chat`, gambar muncul sebagai thumbnail dan galeri Ticket, sementara PDF/TXT memiliki Preview dan Download; akses URL bertanda-tangan singkat memeriksa hak melihat Ticket induknya. Original tetap tersedia ketika ekstraksi diproses atau gagal. Membutuhkan object storage, Worker, `MISTRAL_API_KEY` (kecuali plain text), `INTERNAL_WORKER_TOKEN`, dan konfigurasi AI Agent. Upload Attachment dari Human Agent belum tersedia. |
| Telemetry AI Agent | Siap dicoba — jalankan `apps/api` dengan `ENABLE_TELEMETRY="true"`, `TELEMETRY_EXPORTER="otlp"`, endpoint dan kredensial OTLP (default Langfuse Cloud) sesuai [docs/setup/06-observability.md](setup/06-observability.md), atau `TELEMETRY_EXPORTER="console"` untuk melihat span di stdout. Satu run AI Agent menghasilkan satu trace utuh: `ai_agent.run` mencakup retrieval, tiap panggilan Business Tool, generasi model, dan keputusan akhir beserta Escalation Reason. Capture redacted (mode `safe`) — isi prompt/respons tidak pernah dikirim, sehingga materi Internal-Only tidak lolos dalam bentuk mentah; pending span di-flush saat shutdown maupun exit normal. AI Activity tetap menjadi record produk terpisah di database. |
| Eval suite AI Agent | Siap dicoba — `pnpm eval:ai-agent` (opsional `--category` dan `--case`) menjalankan Eval Case terhadap corpus tetap yang dimuat di memori, bukan terhadap Workspace nyata. Delapan kategori: visibility safety, grounding, escalation yang wajib terjadi, escalation yang tidak boleh terjadi, tool calling, classification, resolution detection, dan language; tiap kategori punya negative control yang selalu gagal. Hasil tercetak di konsol dan dilaporkan lewat OTel eval reporter yang sama dengan Telemetry AI Agent. Dijalankan manual, bukan gate CI. Membutuhkan `OPENROUTER_API_KEY`. |
| WhatsApp dan email sebagai Channel support | Belum tersedia |

## Aturan pembaruan

Saat menutup GitHub issue yang menambah, menghapus, atau mengubah kesiapan fitur:

1. Perbarui baris atau bagian terkait di dokumen ini pada perubahan yang sama.
2. Jelaskan kemampuan yang benar-benar dapat dicoba dan prasyaratnya.
3. Catat batasan yang masih tersisa; pindahkan fitur ke **Siap dicoba** hanya bila alur utamanya terhubung.
4. Sertakan `docs/feature-tracking.md` dalam ringkasan penutupan issue bila status tracking berubah.
