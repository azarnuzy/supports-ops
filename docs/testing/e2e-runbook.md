# Runbook end-to-end lokal

Panduan ini menjalankan satu Workspace demo dari awal sampai akhir: Customer memakai Web Widget, AI Agent mengambil Knowledge atau Business Tool, Ticket diteruskan bila perlu, lalu Human Agent menyelesaikannya. Panduan ini juga menunjukkan cara membaca Telemetry di Langfuse dan menjalankan seluruh Eval Case.

Tidak ada data produksi yang dipakai. Gunakan browser profile/incognito yang berbeda untuk Customer, Admin, dan Human Agent agar session tidak saling bertukar.

## 1. Prasyarat

Salin konfigurasi dan isi nilai minimal berikut di `.env.local`:

```sh
cp .env.example .env.local
# wajib untuk alur AI dan Knowledge
OPENROUTER_API_KEY="..."
# wajib untuk login yang konsisten; gunakan nilai acak setidaknya 32 karakter
BETTER_AUTH_SECRET="..."
# wajib untuk skenario Tools/MCP (bagian 3a): Business System demo berjalan di
# http://localhost:8001, sehingga HTTP Tool dan MCP Server lokal perlu diizinkan
ALLOW_LOCAL_HTTP_TOOLS="true"
# wajib bila ingin membuat/menyimpan HTTP Tool dengan bearer token atau secret headers
TOOL_MASTER_KEY="..."
```

Untuk Telemetry Langfuse, tambahkan juga konfigurasi pada bagian [Telemetry](#6-telemetry-di-langfuse). Attachment PDF/gambar merupakan skenario opsional yang juga memerlukan S3-compatible storage, `MISTRAL_API_KEY`, dan `INTERNAL_WORKER_TOKEN`.

## 2. Menyalakan stack dan demo Workspace

Jalankan perintah ini dari root repository:

```sh
pnpm install
docker compose -f docker-compose.dev.yaml -f docker-compose.mailpit.yaml up -d
pnpm db:generate
pnpm db:migrate
pnpm --filter @repo/api dev
pnpm --filter @repo/worker dev
pnpm --filter @repo/platform dev
pnpm --filter @repo/widget dev
```

`docker-compose.dev.yaml` juga menyalakan Business System pada port `8001`. File
`docker-compose.mailpit.yaml` menyalakan SMTP Mailpit pada port `1025` dan inbox web
pada port `8025`.
Empat proses terakhir berjalan terus; gunakan empat terminal terpisah. Setelah API dapat terhubung ke Postgres, jalankan sekali pada terminal lain:

```sh
pnpm seed:demo
```

Seed ini idempoten; `pnpm seed:demo -- --reset` menghapus Workspace demo lebih dulu dan menyeed ulang dari nol. Seed menyiapkan:

| Peran/data | Nilai demo |
| --- | --- |
| Admin | `admin@demo.supportops.dev` / `DemoAdmin123!` |
| Human Agent | `agent@demo.supportops.dev` / `DemoAgent123!` |
| Origin Widget yang diizinkan | `localhost:3002`, `localhost:4000` |
| Knowledge | Lima Customer-Safe dan dua Internal-Only, dipublish bila `OPENROUTER_API_KEY` tersedia |
| Business System | Customer demo, termasuk `budi@example.com` dan `siti@example.com` |
| AI Agent | Instructions dan Handoff/AI Resolution Message demo terpasang |
| Webhook Tool | `getSubscriptionStatus` mengarah ke `/subscription-status` pada Business System, aktif untuk AI Agent, dengan guidance "when to use" terisi |
| MCP Server | "Business System Demo" (`/mcp` pada Business System) dengan Tool `getInvoiceStatus` ditemukan, direview, diaktifkan, aktif untuk AI Agent, dan punya guidance sendiri |
| Contoh percakapan | Empat Ticket siap pakai: satu di-resolve AI setelah memanggil Tool, satu eskalasi yang sudah diklaim Human Agent, satu masih `AI_HANDLING`, satu di-resolve Human Agent |

Jika seed mencetak Knowledge Source `drafted (unpublished)`, API key belum tersedia; perbaiki `.env.local`, restart API/Worker, kemudian ulangi `pnpm seed:demo`. Jika seed mencetak peringatan MCP Server tidak terjangkau, pastikan Business System berjalan pada port `8001`, lalu ulangi `pnpm seed:demo` untuk melakukan discovery dan mengaktifkan `getInvoiceStatus`.

## 3. Implementasi dan mencoba Web Widget

### Implementasi pada situs sendiri

1. Login sebagai Admin di `http://localhost:3000`.
2. Buka **Settings → Web Widget** (`/settings/widget`). Atur warna/pesan bila perlu dan tambahkan host situs target, tanpa protokol, misalnya `localhost:4000` atau `help.example.com`. Simpan.
3. Salin embed snippet yang diberikan. Untuk deployment, `src` harus mengarah ke bundle Widget yang sudah dibangun dan di-host, misalnya:

   ```html
   <script
     src="https://widget.example.com/widget.js"
     data-widget-key="widget_...">
   </script>
   ```

4. Tempel snippet tepat sebelum `</body>` pada situs target. Widget sendiri memakai shadow root sehingga CSS situs host tidak mengubah UI Widget.

`widgetKey` hanya mengidentifikasi Workspace; ia bukan kredensial. API tetap menolak origin yang tidak ada di allowlist.

### Host demo lokal

Untuk mencoba pengalaman Widget tanpa situs lain, buka `http://localhost:3002/demo.html?widgetKey=<widget-key>`. Ambil key dari snippet di halaman Settings tadi. Halaman ini merupakan host nyata pada `localhost:3002`, origin yang disiapkan oleh seed, dan memuat launcher di kanan bawah.

Lalu lakukan Pre-Chat memakai nama bebas dan salah satu email demo (contoh `siti@example.com`). Ticket belum ada pada langkah ini; Ticket hanya dibuat saat pesan support pertama dikirim.

Untuk menguji aturan keamanan origin, buka demo host dari origin yang belum diizinkan atau hapus `localhost:3002` dari allowlist. Launcher tidak akan dimuat karena `GET /widget/config` ditolak. Tambahkan origin tersebut kembali untuk melanjutkan.

### Menguji logo pada header Widget

1. Di **Settings → Web Widget**, unggah logo (PNG/JPG/SVG, maks. 2MB).
2. Muat ulang demo host (`http://localhost:3002/demo.html?widgetKey=<widget-key>`), buka launcher, dan konfirmasi logo tersebut muncul di header panel chat. Tombol launcher tetap memakai ikon generik.
3. Hapus logo dari Settings, muat ulang demo host lagi, dan konfirmasi header kembali memakai ikon chat generik.

### Menguji Session Link dengan Mailpit

Mailpit menangkap email lokal; tidak ada email yang dikirim ke inbox sungguhan. Pastikan
konfigurasi email di `.env.local` tetap mengarah ke SMTP lokal dan Resend tidak aktif:

```dotenv
SMTP_URL="smtp://localhost:1025"
RESEND_API_KEY=""
EMAIL_FROM="SupportOps <support@example.com>"
```

Jika nilai tersebut diubah saat Worker sedang berjalan, restart proses Worker. Kemudian:

1. Pastikan container Mailpit hidup dengan `docker compose -f docker-compose.dev.yaml -f docker-compose.mailpit.yaml ps mailpit`.
2. Buka inbox Mailpit di [http://localhost:8025](http://localhost:8025).
3. Di host demo Widget, isi dan kirim Pre-Chat dengan nama serta alamat email apa pun. Alamat tidak harus nyata karena Mailpit menangkap semua penerima lokal.
4. Tunggu Worker memproses queue `session-email`, lalu buka email terbaru di Mailpit.
5. Verifikasi penerima sesuai email Pre-Chat, pengirim `SupportOps <support@example.com>`, subject `Return to your SupportOps chat`, dan body berisi tautan untuk kembali ke Web Session.
6. Buka tautan dari email. Secara default URL-nya diawali `http://localhost:8000/widget/session?token=...` dan harus membuka Web Session yang sama. Setelah Session selesai, tautan yang sama tetap membuka transkrip dalam mode read-only.

Email dibuat segera setelah Pre-Chat berhasil, sebelum Customer mengirim pesan pertama.
Karena pengirimannya asynchronous, Pre-Chat dapat sukses beberapa saat sebelum email muncul;
pembuatan Ticket juga tidak diperlukan untuk menguji email ini.

Jika email tidak muncul:

- Periksa bahwa Mailpit dapat dibuka di port `8025` dan SMTP-nya dipublikasikan di port `1025`.
- Pastikan `RESEND_API_KEY` kosong. Jika terisi, Worker memilih Resend dan tidak memakai Mailpit.
- Pastikan proses `@repo/worker` dan Redis hidup; pengiriman Session Link diproses dari queue, bukan langsung oleh API.
- Periksa log Worker untuk `Session Link email failed`. Error koneksi biasanya berarti `SMTP_URL` atau container Mailpit tidak tersedia.
- Kirim Pre-Chat baru setelah Worker diperbaiki. Kegagalan enqueue sengaja tidak menggagalkan pembuatan Web Session.

### Konfigurasi Tools dan MCP Server

`pnpm seed:demo` sudah menyiapkan HTTP Tool dan MCP Server demo di atas melalui application service yang sama dengan langkah manual berikut, sehingga langkah ini opsional — jalankan untuk melihat sendiri alur Admin, atau untuk memahami apa yang sudah diseed:

1. Login sebagai Admin, buka **Settings → Tools** (`/settings/tools`). Tool HTTP `getSubscriptionStatus` (method GET, URL `http://localhost:8001/subscription-status`) sudah ada dari seed; buat manual dengan tombol "New HTTP Tool" bila ingin mengulang dari awal.
2. Buka **Settings → MCP Servers** (`/settings/mcp`). Tambah server dengan URL `http://localhost:8001/mcp`, klik **Test Connection** (harus sukses selama Business System berjalan dan `ALLOW_LOCAL_HTTP_TOOLS=true`), lalu **Discover Tools**. Tool `getInvoiceStatus` muncul dengan status belum diaktifkan; review lalu aktifkan dengan risk `READ_ONLY`.
3. Masih di **Settings → Tools**, nyalakan sakelar kedua Tool untuk AI Agent, buka detail masing-masing, lalu isi **When to use this tool** — kalimat itu ditambahkan ke deskripsi Tool yang dibaca model, dan itulah satu-satunya cara mengarahkan pemilihan Tool. Tidak ada aturan yang memaksa sebuah Tool dipanggil.
4. Tool yang baru ditemukan tapi belum diaktifkan/ditetapkan tidak pernah bisa dipanggil AI Agent, termasuk bila Customer menyebut namanya secara eksplisit — resolver runtime hanya mengembalikan Tool yang enabled, tersedia, dan ditetapkan (lihat W3b).

## 4. Skenario produk end-to-end

Gunakan email Customer baru untuk setiap baris agar Web Session dan Ticket tidak tercampur. Kolom bukti menyebut permukaan yang harus diperiksa.

| ID | Skenario dan input Customer | Hasil yang diharapkan | Bukti |
| --- | --- | --- | --- |
| W1 | Pre-Chat, lalu jangan mengirim pesan | Web Session aktif, tanpa Ticket | Widget terbuka; tidak ada Ticket baru di Platform |
| W2 | `How do I reset my password?` | AI menjawab dari Knowledge Customer-Safe, bahasa mengikuti Customer | Widget memperlihatkan balasan bertahap; Ticket diklasifikasi |
| W3 | `Is my subscription active?` | AI Agent memilih sendiri Webhook Tool `getSubscriptionStatus` dari deskripsi dan guidance-nya, lalu menjawab dari data live Business System, bukan mengarang | Balasan Widget; AI Activity mencatat `TOOL_CALLED` origin `HTTP` |
| W3a | `What's the status of my latest invoice?` | Dari dua Tool yang aktif, AI Agent memilih MCP Tool `getInvoiceStatus` karena deskripsi dan guidance-nya yang cocok | Balasan Widget; AI Activity mencatat `TOOL_CALLED` origin `MCP` |
| W3b | Di `/settings/mcp`, discover ulang lalu jangan aktifkan sebuah Tool baru (atau nonaktifkan `getInvoiceStatus`), lalu ulangi W3a | AI Agent tidak pernah memanggil Tool yang belum diaktifkan/ditetapkan, termasuk bila Customer menyebut namanya; AI menjawab dari Knowledge saja atau eskalasi | Tidak ada `TOOL_CALLED` baru untuk Tool tersebut di AI Activity |
| W3c | Hentikan Business System (`docker compose -f docker-compose.dev.yaml stop business-system` atau matikan proses dev-nya), lalu ulangi W3 | Panggilan Tool yang dipilih AI Agent gagal; Ticket `ESCALATED` dengan alasan `BUSINESS_TOOL_FAILURE` | AI Activity mencatat `TOOL_FAILED`; nyalakan lagi Business System setelah selesai |
| W4 | Minta refund atau `I want to speak to a human` | Ticket `ESCALATED`, acknowledgement dikirim, AI berhenti membalas pesan berikutnya | Admin/Human Agent: `/chat/unassigned` |
| W5 | Dari W4, login Human Agent → Unassigned → Claim | Hanya satu Claim sukses; Ticket `HUMAN_HANDLING`; Handoff dan Escalation Summary tersedia | `/chat` dan Widget menerima perkenalan Human Agent |
| W6 | Dari W5, minta Suggested Reply, edit bila perlu, kirim reply, lalu Resolve | Draft tidak terkirim otomatis; Resolution oleh Human Agent mengirim closing message; Widget read-only | `/chat`; Widget menampilkan tombol Start a new conversation |
| W7 | Pertanyaan W2, kemudian `Yes, that solved it` | AI melakukan Resolution sebagai `CUSTOMER_CONFIRMED` | Widget read-only; trace keputusan `RESOLVE` |
| W8 | Pertanyaan W2, kemudian hanya `thanks` | Tidak boleh langsung Resolution; AI meminta klarifikasi bila perlu | Widget tetap menerima input |
| W9 | Set Follow-Up dan Auto-Resolution ke beberapa detik di `/settings/ai`; kirim W2 lalu diam | Satu Follow-Up terkirim. Bila Auto-Resolution aktif dan Customer tetap diam, Ticket selesai sebagai `CUSTOMER_INACTIVE` | Log Worker, Widget, dan Ticket status |
| W10 | Saat Ticket masih `AI_HANDLING`, login Admin → `/chat/ai-live` → Take over | Streaming AI berhenti, Ticket diambil Admin, Customer menerima perkenalan manusia, timer dibatalkan | `/chat/ai-live` dan Widget |
| W11 | Kirim `.txt` berisi konteks dan pertanyaan terkait | Status Attachment berubah processing → ready dan isinya menjadi konteks Ticket | Widget dan log Worker. PDF/JPEG/PNG memerlukan kredensial Attachment tambahan |
| W12 | Selesaikan sebuah Ticket sebagai Customer tertentu, lalu buat Web Session baru dengan email yang sama dan tanyakan konteks kasus lama | Ticket Knowledge hanya dapat dipakai pada Customer Identity dan Channel sama | Trace retrieval dan jawaban; jangan gunakan sebagai sumber kebijakan baru |
| W13 | Login Admin → Dashboard | Angka Resolution AI (confirmed vs inactive), escalation rate, Ticket/channel, dan Ticket aktif per Human Agent terpisah | `http://localhost:3000/` |
| W14 | Selesaikan sebuah Ticket (lihat W6), lalu buka `/chat/all`, cari nama Customer-nya, dan filter status ke Resolved | Ticket yang sudah Resolved tetap muncul di scope All dengan filter/pencarian; Human Agent hanya melihat Ticket miliknya, Shared Human Queue, dan Ticket yang pernah ia Resolve, sedangkan Admin melihat seluruh Ticket Workspace | `/chat/all` |

Catatan keputusan: bila Admin melakukan Takeover, tetapkan kembali Ticket ke Human Agent sebelum Resolution bila UI/API menolak Admin untuk melakukan Resolution langsung.

## 5. Test case AI yang wajib dijalankan

Jalankan seluruh suite setelah stack dan key AI siap:

```sh
pnpm eval:ai-agent
```

Delapan kategori yang dicakup: `visibility-safety`, `grounding`, `escalation-required`, `escalation-forbidden`, `tool-calling`, `classification`, `resolution-detection`, dan `language`. Setiap kategori punya negative control yang memang harus gagal; itu bukti evaluator tidak selalu melaporkan hijau.

Untuk mengisolasi kegagalan, jalankan kategori atau case tertentu:

```sh
pnpm eval:ai-agent -- --category grounding
pnpm eval:ai-agent -- --category language
pnpm eval:ai-agent -- --category grounding --case password-reset-answered-from-source
```

Eval memakai corpus in-memory yang tetap, bukan Knowledge pada Workspace demo. Jadi gunakan tabel W1–W14 untuk membuktikan integrasi produk, dan eval untuk mencegah regresi perilaku AI.

## 6. Telemetry di Langfuse

1. Buat project di Langfuse Cloud (pilih region EU atau US), lalu buat API key pair di **Settings → API Keys**.
2. Bentuk Basic credential tanpa menyimpan outputnya ke shell history:

   ```sh
   printf '%s' 'pk-lf-...:sk-lf-...' | base64
   ```

3. Isi `.env.local`, lalu restart API dan Worker:

   ```dotenv
   ENABLE_TELEMETRY="true"
   TELEMETRY_EXPORTER="otlp"
   TELEMETRY_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel"
   # Untuk project US gunakan https://us.cloud.langfuse.com/api/public/otel
   TELEMETRY_API_KEY="Basic <base64-public-key:secret-key>"
   TELEMETRY_API_KEY_HEADER="authorization"
   TELEMETRY_SERVICE_NAMESPACE="supportops"
   ```

4. Jalankan W2, W3, W3a, W4, dan W7. Di Langfuse buka project → **Traces**, filter service `supportops` bila diperlukan, lalu buka trace terbaru.

Trace satu AI Agent run berisi root `ai_agent.run`, dengan child span retrieval, setiap Business Tool, dan generasi model (`gen_ai.*`). Periksa atribut keputusan akhir (`REPLY`, `CLARIFY`, `ESCALATE`, atau `RESOLVE`) dan Escalation Reason bila ada. Prompt dan response body memang tidak dikirim: telemetry berada pada mode redacted/safe. Untuk debug tanpa Langfuse, gunakan `TELEMETRY_EXPORTER="console"` dan lihat stdout API/Worker.

## 7. Kriteria selesai

Sebuah run dapat dianggap lengkap bila W1–W10, W13, dan W14 selesai; W3a–W3c perlu bila alur Tools/MCP (#94) berada dalam scope release; W11 perlu bila Attachment berada dalam scope release, W12 perlu bila Ticket Knowledge berada dalam scope release; seluruh eval telah dijalankan dan negative control tercatat sebagai gagal yang diharapkan. Simpan tautan trace Langfuse yang relevan dan ID Ticket untuk setiap skenario—keduanya cukup untuk mengulang atau menelusuri kegagalan tanpa menyalin percakapan Customer ke dokumen.

Alur Tools/MCP (W3–W3c) tidak memerlukan layanan MCP pihak ketiga: Business System yang sama (`apps/business-system`) berperan sebagai HTTP API dan demo MCP Server.
