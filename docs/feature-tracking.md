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
| `/` | Pengguna masuk | Siap dicoba | Melihat ringkasan profil dan metadata Workspace. | Bukan dashboard metrik Ticket. |
| `/profile` | Pengguna masuk | Siap dicoba | Mengubah nama tampilan dan URL avatar. | — |
| `/settings/agents` | Admin | Siap dicoba | Membuat Human Agent dan melihat daftar Human Agent dalam Workspace. | Belum ada pengelolaan lanjutan seperti edit/nonaktifkan akun. |
| `/settings/widget` | Admin | Siap dicoba | Mengatur nama AI, pesan sambutan/penutup, warna, domain yang diizinkan, preview, dan embed snippet. | Pesan penutup belum dipicu karena Resolution belum tersedia. |
| `/knowledge` | Admin | Siap dicoba | Membuat, mengubah, menghapus, dan publish Manual FAQ; memilih Customer-Safe atau Internal-Only; menjalankan Retrieval test. | Hanya Manual FAQ. Sumber yang dipublish Customer-Safe dipakai oleh AI Agent di Web Widget; Internal-Only tidak pernah dipakai untuk balasan Customer. |
| `/chat` | Pengguna masuk | Sebagian siap | Menjelajahi tampilan inbox, pencarian/filter tampilan, dan panel detail percakapan contoh. | Semua percakapan dan tindakan masih data/UI contoh; belum membaca atau mengelola Ticket nyata. |
| `/tickets/queue` | Human Agent, Admin | Siap dicoba | Melihat Shared Human Queue escalated secara oldest-first; Human Agent dapat Claim dan Admin dapat memilih Human Agent untuk menugaskan Ticket. Perubahan queue masuk otomatis tanpa refresh halaman. | Belum ada detail Ticket atau balasan Human Agent dari halaman ini. |
| `/tickets/mine` | Human Agent | Siap dicoba | Melihat semua Ticket aktif yang telah di-Claim oleh Human Agent yang masuk, termasuk Escalation Summary yang muncul setelah Handoff selesai dibuat. | Belum ada detail Ticket atau balasan Human Agent dari halaman ini. |
| `/gallery` | Pengguna masuk | Siap dicoba | Melihat komponen visual dan status Ticket untuk referensi desain. | Hanya galeri komponen, bukan fitur operasional. |

## Web Widget

| Kemampuan | Status | Yang dapat dicoba | Batasan saat ini |
| --- | --- | --- | --- |
| Memuat widget dari embed snippet | Siap dicoba | Pasang snippet pada domain yang diizinkan, lalu buka launcher. | Widget ditolak dari domain di luar allowlist. |
| Pre-Chat dan Web Session | Siap dicoba | Customer mengisi nama dan email untuk memulai Web Session. | Email Session Link membutuhkan Redis, Worker, dan konfigurasi layanan email. |
| Mengirim pesan Customer dan balasan AI Agent | Siap dicoba | Pesan pertama membuat Ticket; AI Agent mengambil Knowledge Source Customer-Safe yang sudah dipublish lalu membalas dalam bahasa Customer. Balasan muncul bertahap melalui SSE dan input terkunci selama generasi. | Jika tidak ada sumber yang mendukung jawaban, generasi gagal dua kali, atau permintaan tetap ambigu setelah dua klarifikasi, Ticket dieskalasi; belum ada UI Human Agent untuk menanganinya. Membutuhkan `OPENROUTER_API_KEY`, Postgres, Redis, Worker, dan Knowledge Source Customer-Safe yang dipublish. |

## Alur support yang belum tersedia

| Fitur | Status |
| --- | --- |
| AI Agent menjawab dari Customer-Safe Knowledge | Siap dicoba di Web Widget; lihat prasyarat dan batasan di atas. |
| Escalation dan Shared Human Queue | Siap dicoba di Web Widget — minta Human Agent secara natural dalam Bahasa Indonesia atau Inggris, atau kirim pertanyaan tanpa Knowledge Source Customer-Safe yang relevan. Ticket berpindah ke `ESCALATED`, menyimpan alasan baku dan AI Activity, lalu Customer menerima acknowledgement; pesan Customer berikutnya tetap tercatat tanpa balasan AI. Memerlukan prasyarat Web Widget dan, untuk escalation berbasis knowledge, konfigurasi AI Agent. Belum ada UI Shared Human Queue, Claim, atau Takeover untuk Human Agent. |
| Claim | Siap dicoba — Human Agent dapat Claim Ticket dari Shared Human Queue; update kondisional memastikan satu Claim menang bila dua Human Agent mencoba bersamaan. Admin dapat menugaskan Ticket kepada Human Agent lain. Membutuhkan Postgres dan Redis, serta Ticket yang sudah dieskalasi. |
| Handoff dan Escalation Summary | Siap dicoba — setelah Human Agent Claim Ticket, Customer menerima pengenalan yang menyebut nama Human Agent melalui SSE, dan Escalation Summary baru dibuat dari percakapan serta AI Activity saat itu. Ringkasan muncul otomatis di `/tickets/mine`; bila pembuatan gagal, Claim tetap berlaku dan Human Agent melihat pemberitahuan untuk meninjau percakapan langsung. Membutuhkan prasyarat Claim dan `OPENROUTER_API_KEY` untuk menghasilkan ringkasan. |
| Takeover | Belum tersedia |
| Human Agent membalas dan melakukan Resolution | Belum tersedia |
| AI Copilot dan Suggested Reply | Belum tersedia |
| Activity Timeline, AI Activity, Follow-Up, dan Auto-Resolution | Belum tersedia |
| Business Tools | Sebagian siap — AI Agent dapat membaca Customer, Subscription, dan Invoice dari Business System terpisah; kegagalan tool serta permintaan perubahan langganan/refund dieskalasi. Jalankan Postgres dan Business System (`docker compose -f docker-compose.dev.yaml up -d`) serta gunakan Customer demo `budi@example.com` atau `siti@example.com`. Belum ada UI Admin untuk melihat AI Activity atau mengelola data Business System. |
| Attachment | Siap dicoba di Web Widget — kirim PDF, plain text, JPEG, atau PNG (maks. 10 MB) bersama konteks singkat; status processing terlihat dan teks hasil ekstraksi menjadi konteks Ticket untuk balasan AI. Attachment dapat dibuka dari permukaan Ticket terautentikasi melalui URL bertanda-tangan singkat. Membutuhkan object storage, Worker, `MISTRAL_API_KEY` (kecuali plain text), `INTERNAL_WORKER_TOKEN`, dan konfigurasi AI Agent. Belum ada Ticket UI Human Agent; endpoint pembukaan siap untuk dihubungkan saat alur tersebut tersedia. |
| WhatsApp dan email sebagai Channel support | Belum tersedia |

## Aturan pembaruan

Saat menutup GitHub issue yang menambah, menghapus, atau mengubah kesiapan fitur:

1. Perbarui baris atau bagian terkait di dokumen ini pada perubahan yang sama.
2. Jelaskan kemampuan yang benar-benar dapat dicoba dan prasyaratnya.
3. Catat batasan yang masih tersisa; pindahkan fitur ke **Siap dicoba** hanya bila alur utamanya terhubung.
4. Sertakan `docs/feature-tracking.md` dalam ringkasan penutupan issue bila status tracking berubah.
