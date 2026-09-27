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
# wajib untuk skenario Operator (bagian 5); gunakan nilai acak terpisah
# setidaknya 32 karakter
OPERATOR_AUTH_SECRET="..."
```

Untuk Telemetry Langfuse, tambahkan juga konfigurasi pada bagian [Telemetry](#6-telemetry-di-langfuse). Attachment PDF/gambar merupakan skenario opsional yang juga memerlukan S3-compatible storage, `MISTRAL_API_KEY`, dan `INTERNAL_WORKER_TOKEN`.

## 2. Menyalakan stack dan demo Workspace

### Organization identity (#266)

Setelah `pnpm db:migrate`, buka `/register` di browser baru. Daftar dengan email baru, lalu pastikan browser masuk ke Workspace pertama dan halaman `/agent` serta `/channels/web-widget` masih dapat dibuka. Keluar, masuk lagi melalui `/login`, dan pastikan Workspace yang sama terbuka. Di database, periksa satu `Organization`, satu `Workspace` yang menunjuknya, dan satu `User` dengan `role = ADMIN`, `isOrganizationAdmin = true`, serta `organizationId` yang sama. Pastikan satu AI Agent dan satu Web Widget tersedia.

Untuk data sebelum migrasi, masuk sebagai Admin lama lalu sebagai Human Agent lama. Keduanya harus tetap dapat membuka Ticket dan Session dalam Workspace semula; hanya Admin yang memiliki `isOrganizationAdmin = true`. Tiap Workspace lama harus menunjuk Organization yang berbeda. Catat tanggal, browser, dan hasil pemeriksaan manual sebelum menandai skenario ini selesai.

Hasil 2026-09-27: pengguna mengonfirmasi lewat browser (nama browser tidak dicatat) bahwa registrasi berhasil, halaman AI Agent dan Web Widget terbuka, lalu logout dan login kembali membawa ke Workspace yang sama. Dengan Chromium headless, Admin demo lama berhasil masuk dan melihat Conversations lama, termasuk Session tanpa Ticket; Human Agent demo lama berhasil masuk dan membuka Ticket lama beserta transkripnya. Tes database registrasi lulus (3/3). Pemeriksaan database lokal menemukan 12 Workspace menunjuk 12 Organization berbeda, tanpa Workspace atau user yang kehilangan Organization; Admin terbaru terhubung ke Organization dengan satu AI Agent dan satu Web Widget, dan tidak ada Admin tanpa peran Organization Admin atau Human Agent yang memilikinya.

### Credit Ledger milik Organization (#267)

Setelah migrasi, masuk sebagai Organization Admin lama dan buka Billing serta AI Usage. Catat saldo sebelum dan sesudah migrasi; nilainya harus sama, riwayat Trial Grant, Top-Up, pembayaran, dan spend tetap terlihat. Daftar Organization baru lewat `/register`, lalu pastikan Billing menampilkan satu Trial Grant 500 Credits. Buat Ticket dan biarkan AI Agent menjawab satu Turn: saldo turun sesuai Model Rate, dan AI Usage Workspace menampilkan spend tersebut. Hapus Ticket; entri spend dan saldo tidak boleh berubah. Jika Organization memiliki dua Workspace, keduanya harus membaca saldo yang sama, sementara AI Usage masing-masing hanya menampilkan spend Workspace sendiri. Catat tanggal, browser, saldo awal/akhir, dan hasil tiap langkah sebelum menandai skenario selesai.

### Organization AI Usage (#273)

Masuk sebagai Organization Admin dengan dua Workspace. Jalankan AI Turn pada masing-masing Workspace dan buka `/workspace/ai-usage`: pilih Organization pada filter scope. Pastikan total Credits dan jumlah Turn sama dengan penjumlahan rincian Workspace; filter tanggal, AI Agent, dan Channel harus mengubah keduanya bersama. Selama Unlimited Period, jalankan satu Turn lagi: jumlah Turn bertambah dan Credits spent tetap 0 untuk Turn tersebut. Hapus satu Ticket dan nonaktifkan Workspace asal: spend dan nama Workspace historis tetap muncul. Masuk sebagai Workspace Admin dan pastikan pilihan Organization tidak ada; permintaan langsung `GET /ai-usage/organization-summary` harus 403. Catat tanggal, browser, Workspace, dan hasil tiap langkah.

Hasil 2026-09-27: verifikasi browser belum dilakukan di lingkungan implementasi ini.

### Organization Billing (#269)

Masuk sebagai Organization Admin dan buka `/workspace/billing`: saldo, Top-Up Packs, riwayat pembayaran, dan Credit Ledger harus terlihat. Dengan `MAYAR_API_KEY` sandbox, mulai checkout, selesaikan pembayaran, lalu kembali ke Billing; saldo naik sesuai Pack dan pembayaran berubah menjadi Paid. Kirim ulang webhook atau muat ulang Billing: saldo tidak bertambah lagi. Pada dua Workspace dalam Organization yang sama, Billing memperlihatkan pembayaran dan saldo yang sama; Organization lain tidak melihatnya. Masuk sebagai Workspace Admin: halaman operasional dan AI Usage tetap terbuka, tetapi menu Billing tidak tampil, akses langsung `/workspace/billing` dialihkan, dan `GET /billing`, `POST /billing/checkout`, serta `GET /ai-usage/ledger` menghasilkan 403. Catat tanggal, browser, akun/peran, saldo sebelum/sesudah, dan hasil tiap langkah.

Hasil 2026-09-27: verifikasi browser belum dilakukan; tidak ada sesi browser dan kredensial Mayar sandbox yang tersedia pada lingkungan implementasi ini. Status skenario: menunggu verifikasi manual.

Hasil: belum diverifikasi secara manual di browser.

### Organization Admin menangani Ticket lintas Workspace (#272)

Masuk sebagai satu Organization Admin tanpa akun Human Agent kedua. Siapkan dua Workspace dalam Organization yang sama dan satu Workspace milik Organization lain; buat Session Web Widget dan WhatsApp serta Ticket eskalasi di kedua Workspace sendiri. Pilih Workspace kedua: `/chat/all` harus menggabungkan kedua Channel hanya dari Workspace itu, `/chat/unassigned` harus memuat eskalasinya, dan Ticket Workspace pertama maupun Organization lain tidak boleh terlihat. Claim satu Ticket, periksa bahwa ia pindah ke My Tickets atas nama Admin, kirim balasan teks dan Attachment, lalu Resolve. Pada Ticket AI yang lain, lakukan Takeover, balas, lalu Resolve. Kembali ke Workspace pertama dan pastikan Ticket Workspace kedua tidak tampil. Masuk sebagai Human Agent: Shared Human Queue dan My Tickets hanya memuat Ticket yang sesuai hak akses di Workspace asal; request dengan `X-Workspace-Id` menuju Workspace saudara harus mendapat `403`. Periksa event realtime pada Queue dan Ticket setelah switch Workspace. Catat tanggal, browser, akun/peran, ID Workspace dan Ticket, serta hasil tiap langkah.

Hasil: belum diverifikasi secara manual di browser.

### Operator Organization directory (#274)

Masuk ke Console sebagai Operator. Buka `/organizations` dan pastikan dua Workspace milik Organization yang sama tampil dalam satu baris dengan satu saldo. Buka detail Organization: kedua Workspace harus tertaut ke detail operasional masing-masing, Organization Admin terdaftar, dan pembayaran serta Credit Ledger terlihat. Catat saldo awal; gunakan **Record Top-Up** dengan jumlah dan catatan pembayaran, konfirmasi sekali, lalu pastikan saldo naik tepat sebesar jumlah itu, ledger mendapat satu `TOP_UP`, dan Audit Log mendapat satu `TOP_UP`. Periksa Billing dari kedua Workspace: saldonya sama dan Credits dapat dibelanjakan di masing-masing Workspace. Pastikan akun Workspace tidak dapat mengakses Console dan tampilan Operator tidak mengungkap isi Customer Message. Catat tanggal, browser, akun, saldo awal/akhir, dan hasil tiap langkah.

Hasil #274: belum diverifikasi secara manual di browser.

### Billing & Credits dan Audit Log berlabel Organization (#277)

Masuk ke Console sebagai Operator dengan minimal satu Organization yang punya dua Workspace aktif dan satu Unlimited Period aktif. Buka `Billing & Credits`: panel "Credits balance distribution" dan metrik "Active Unlimited Periods" harus menghitung Organization itu satu kali walau ia punya dua Workspace, sedangkan panel "Top Workspaces by Credits consumed" tetap memecah spend per Workspace. Buka tab Payments dan Credits: baris Top-Up, Trial Grant, dan pembayaran harus menampilkan nama Organization (tertaut ke `/organizations/:id`), bukan salah satu Workspace anaknya; baris Spend harus menampilkan Organization dan Workspace asal spend itu. Buka `Audit Log`: entri `TOP_UP` dan `UNLIMITED_PERIOD_*` harus menampilkan Organization yang sama. Hapus (soft delete) Workspace anchor tempat Unlimited Period pertama kali dibuat, lalu refresh Audit Log dan Billing & Credits: Organization tetap teridentifikasi di baris-baris itu. Catat tanggal, browser, akun, dan hasil tiap langkah.

Hasil: belum diverifikasi secara manual di browser.

### Workspace detail operasional tertaut ke Organization (#276)

Masuk ke Console sebagai Operator. Buka `/workspaces`: setiap baris menampilkan kolom Organization yang tertaut ke `/organizations/:id` milik Workspace itu, sementara Health, Users, Channels, Sessions, Ticket outcomes, dan AI Usage tetap milik Workspace itu sendiri. Buka detail satu Workspace: judul halaman menautkan ke Organization pemiliknya, panel "Organization credits" menampilkan saldo dan Unlimited Period Organization sebagai info baca-saja dengan tautan "Manage in Organization", dan tombol Top-Up/Grant/Extend langsung tidak lagi ada di halaman ini. Buka panel Needs attention (`/needs-attention`): risiko finansial (saldo rendah/habis, Unlimited Period berakhir) kini dilaporkan per Organization ([#278](https://github.com/azarnuzy/supports-ops/issues/278)) dengan aksi Top-Up/Extend di sana; baris operasional per Workspace hanya menyisakan tautan "View workspace". Verifikasi bahwa mengubah Top-Up atau Unlimited Period tetap hanya bisa dilakukan dari detail Organization, dan tampilan Operator tidak mengungkap isi Customer Message. Catat tanggal, browser, akun, dan hasil tiap langkah.

Hasil #276: belum diverifikasi secara manual di browser pada lingkungan implementasi ini (tidak ada stack lokal Postgres/Console yang berjalan). Diverifikasi lewat test otomatis: `apps/api` (`pnpm --filter @repo/api vitest run`, termasuk `operator/workspaces.db.test.ts` dan `operator/at-risk.db.test.ts`) dan `pnpm --filter @repo/console typecheck` lulus tanpa regresi baru.

### Shared Credit balance lintas Workspace (#268)

Siapkan dua Workspace dalam satu Organization dan satu Workspace di Organization lain. Masuk sebagai Organization Admin, buka Billing di kedua Workspace, lalu jalankan satu AI Turn dari masing-masing Web Widget. Saldo Billing keduanya harus turun dari satu balance yang sama, sedangkan AI Usage tiap Workspace hanya mencatat spend sendiri. Membuat Workspace atau AI Agent tambahan tidak boleh menambah Trial Grant. Turunkan balance ke 100 lalu kirim Turn hingga melewati batas: Mailpit harus menerima satu alert low-balance untuk Organization Admin, bukan Admin Workspace biasa. Habiskan balance dan kirim Customer Message baru di kedua Workspace: kedua Ticket harus masuk Shared Human Queue dengan alasan `CREDIT_EXHAUSTION`, dan Mailpit menerima satu alert exhaustion. AI Turn yang sudah dimulai sebelum saldo habis boleh selesai. Organization lain tetap memiliki saldo dan AI Agent aktif. Catat tanggal, browser, saldo awal/akhir, Ticket, dan pesan Mailpit.

Hasil 2026-09-27 (Chromium headless, Platform lokal dan Mailpit): Organization uji baru menampilkan Trial Grant 500 Credits. Setelah Workspace kedua dan AI Agent tambahan dibuat, Trial Grant tetap satu. Spend dari Workspace kedua menurunkan Billing di kedua Workspace menjadi 499; AI Usage Workspace kedua menunjukkan 1 Credit spent. Saldo uji kemudian disiapkan pada 100 dan 1 Credit; satu spend pada masing-masing ambang menurunkannya ke 99 dan 0. Mailpit menerima tepat satu email low-balance dan satu email exhaustion untuk Organization Admin. Customer Message dari Web Widget masing-masing Workspace saat saldo 0 membuat dua Ticket berstatus `ESCALATED` dengan alasan `CREDIT_EXHAUSTION`; Organization uji lain tetap menampilkan 500 Credits. Persiapan saldo ambang dan spend awal dilakukan melalui service/ledger lokal, bukan dengan ratusan AI Turn di browser. AI Turn yang sudah berjalan ketika saldo habis belum diuji secara manual.

### Workspace switcher (#270)

Masuk sebagai Organization Admin dan buka switcher Workspace di header. Buat Workspace baru lewat dialog "Create Workspace"; halaman langsung berpindah ke Inbox (`/chat`) Workspace baru itu, dan `/agent` serta `/channels/web-widget` menampilkan AI Agent serta Web Widget default milik Workspace itu, terpisah dari Workspace pertama. Di database, pastikan Workspace baru menunjuk `organizationId` yang sama dengan Workspace pertama, dan Trial Grant Organization tidak bertambah (satu `CreditLedgerEntry` bertipe `TRIAL_GRANT` saja). Pilih kembali Workspace pertama dari switcher: switcher hanya menampilkan Workspace milik Organization yang sama (bukan milik Organization lain), dan Ticket/Customer/Knowledge di dua Workspace tidak saling terlihat.

Muat ulang browser (refresh) setelah memilih Workspace baru: Workspace yang sama tetap terbuka. Buka tab kedua dan pilih Workspace pertama di sana; kedua tab harus tetap menampilkan Workspace masing-masing tanpa saling memengaruhi permintaan API. Sebagai pemeriksaan server-side, kirim request langsung ke API dengan header `X-Workspace-Id` berisi id Workspace tebakan atau id Workspace milik Organization lain: server harus menolak dengan `403`, sebelum permintaan itu menyentuh data Workspace manapun. Masuk sebagai Admin biasa (bukan Organization Admin) dan pastikan switcher tidak tampil serta header `X-Workspace-Id` ke Workspace lain juga ditolak `403`. Catat tanggal, browser, akun/peran, dan hasil tiap langkah.

Hasil: belum diverifikasi secara manual di browser.

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
2. Buka **Channels → Web Widget** (`/channels/web-widget`). Atur warna/pesan bila perlu dan tambahkan host situs target, tanpa protokol, misalnya `localhost:4000` atau `help.example.com`. Simpan.
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

1. Di **Channels → Web Widget**, unggah logo (PNG/JPG/SVG, maks. 2MB).
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
6. Buka tautan dari email di tab atau browser lain. Secara default URL-nya diawali `http://localhost:8000/widget/session?token=...` dan harus membuka halaman chat penuh dengan transkrip Session yang sama, bukan respons JSON. Kirim pesan dari halaman itu dan pastikan muncul di Widget asal. Setelah Session ditutup, tautan yang sama hanya membuka transkrip; composer tidak tampil.
7. Sebelum mengirim Pre-Chat berikutnya, periksa alamat email di formulir. Siapa pun yang menerima tautan dapat membaca Session dan mengirim pesan selama masih aktif; email tidak diverifikasi.

Email dibuat segera setelah Pre-Chat berhasil, sebelum Customer mengirim pesan pertama.
Karena pengirimannya asynchronous, Pre-Chat dapat sukses beberapa saat sebelum email muncul;
pembuatan Ticket juga tidak diperlukan untuk menguji email ini.

Jika email tidak muncul:

- Periksa bahwa Mailpit dapat dibuka di port `8025` dan SMTP-nya dipublikasikan di port `1025`.
- Pastikan `RESEND_API_KEY` kosong. Jika terisi, Worker memilih Resend dan tidak memakai Mailpit.
- Pastikan proses `@repo/worker` dan Redis hidup; pengiriman Session Link diproses dari queue, bukan langsung oleh API.
- Periksa log Worker untuk `Session Link email failed`. Error koneksi biasanya berarti `SMTP_URL` atau container Mailpit tidak tersedia.
- Jika Redis gagal menerima job, Pre-Chat menampilkan error; perbaiki Redis lalu ulangi Pre-Chat. Jika Worker berhenti tetapi Redis hidup, Pre-Chat tetap berhasil dan email menunggu Worker berjalan lagi. Kegagalan pengiriman setelah job masuk antrean tercatat di log Worker.

### Konfigurasi Tools dan MCP Server

`pnpm seed:demo` sudah menyiapkan HTTP Tool dan MCP Server demo di atas melalui application service yang sama dengan langkah manual berikut, sehingga langkah ini opsional — jalankan untuk melihat sendiri alur Admin, atau untuk memahami apa yang sudah diseed:

1. Login sebagai Admin, buka **Configure → Tools** (`/agent/tools`). Tool HTTP `getSubscriptionStatus` (method GET, URL `http://localhost:8001/subscription-status`) sudah ada dari seed; buat manual dengan tombol "New HTTP Tool" bila ingin mengulang dari awal.
2. Buka **Configure → MCP Servers** (`/agent/mcp-servers`). Tambah server dengan URL `http://localhost:8001/mcp`, klik **Test Connection** (harus sukses selama Business System berjalan dan `ALLOW_LOCAL_HTTP_TOOLS=true`), lalu **Discover Tools**. Tool `getInvoiceStatus` muncul dengan status belum diaktifkan; review lalu aktifkan dengan risk `READ_ONLY`.
3. Masih di **Configure → Tools**, nyalakan sakelar kedua Tool untuk AI Agent, buka detail masing-masing, lalu isi **When to use this tool** — kalimat itu ditambahkan ke deskripsi Tool yang dibaca model, dan itulah satu-satunya cara mengarahkan pemilihan Tool. Tidak ada aturan yang memaksa sebuah Tool dipanggil.
4. Tool yang baru ditemukan tapi belum diaktifkan/ditetapkan tidak pernah bisa dipanggil AI Agent, termasuk bila Customer menyebut namanya secara eksplisit — resolver runtime hanya mengembalikan Tool yang enabled, tersedia, dan ditetapkan (lihat W3b).

## 4. Skenario produk end-to-end

### Workspace staff dan peran (#271)

1. Daftar sebagai Organization Admin, buka `/workspace/users`, tambah satu Human Agent, lalu tunjuk ia sebagai Organization Admin. Ia tetap memakai login yang sama.
2. Buat Workspace kedua dari switcher. Di `/workspace/users` Workspace kedua, tambah email yang sama dengan peran Admin; daftar harus menampilkan peran Workspace kedua. Pindah balik dan pastikan peran Workspace pertama tetap Human Agent.
3. Sebagai Workspace Admin biasa, pastikan hanya Workspace miliknya yang bisa dibuka dan ia tidak dapat menunjuk Organization Admin atau membuka Billing. Coba header `X-Workspace-Id` milik Organization lain: server harus menjawab `403`.
4. Cabut Organization Admin lain, lalu coba cabut Organization Admin terakhir: server harus menjawab `409`. Pengguna dengan Ticket `HUMAN_HANDLING` harus ditugaskan ulang sebelum membership-nya dicabut.

Verifikasi browser lokal 27 September 2026: **lulus** (Chrome headless terhadap API dan Platform lokal). Registrasi, tambah staf sebagai Human Agent, penunjukan Organization Admin, pembuatan/pemilihan Workspace kedua, dan penambahan email yang sama sebagai Admin di Workspace kedua berhasil. Setelah hak Organization Admin staf dicabut, sesi staf tetap membaca `HUMAN_AGENT` di Workspace pertama dan `ADMIN` di Workspace kedua; Billing dan header Workspace tebakan ditolak `403`. Pencabutan Organization Admin terakhir dan undangan email milik Organization lain ditolak `409`. Penghapusan membership lewat UI mencabut akses ke Workspace kedua (`403` pada sesi staf yang masih aktif). Pengguna dengan Ticket aktif perlu diuji terpisah sebelum rilis produksi.

Gunakan email Customer baru untuk setiap baris agar Web Session dan Ticket tidak tercampur. Kolom bukti menyebut permukaan yang harus diperiksa.

| ID | Skenario dan input Customer | Hasil yang diharapkan | Bukti |
| --- | --- | --- | --- |
| W1 | Pre-Chat, lalu jangan mengirim pesan | Web Session aktif, tanpa Ticket | Widget terbuka; tidak ada Ticket baru di Platform |
| W1a | Set Follow-Up dan Auto-Resolution ke beberapa detik di `/agent`, lalu setelah W1 kirim `Hi` dan biarkan AI membalas; kemudian diam | Follow-Up umum muncul tanpa Ticket dan tanpa pengurangan Credit; setelah jeda kedua, Session `CLOSED` tanpa Ticket/Resolution, tautan email hanya-baca | Widget, halaman chat penuh, `/chat/all`, AI Usage |
| W1b | Setelah basa-basi W1a tetapi sebelum timer berakhir, gunakan tombol reset pada widget yang sama lalu mulai Session baru dengan email yang sama | Session lama tanpa Ticket langsung `CLOSED`; tautan lamanya hanya-baca dan tautan baru membuka Session baru. Jika Session lama sudah punya Ticket aktif, Ticket tersebut tetap aktif dan tautannya tetap dapat dipakai. Pre-Chat dari browser lain tanpa token lama tidak menutup Session hanya berdasarkan email | Widget, kedua email Session Link, `/chat/all` |
| W2 | `How do I reset my password?` | AI menjawab dari Knowledge Customer-Safe, bahasa mengikuti Customer | Widget memperlihatkan balasan bertahap; Ticket diklasifikasi |
| W3 | `Is my subscription active?` | AI Agent memilih sendiri Webhook Tool `getSubscriptionStatus` dari deskripsi dan guidance-nya, lalu menjawab dari data live Business System, bukan mengarang | Balasan Widget; AI Activity mencatat `TOOL_CALLED` origin `HTTP` |
| W3a | `What's the status of my latest invoice?` | Dari dua Tool yang aktif, AI Agent memilih MCP Tool `getInvoiceStatus` karena deskripsi dan guidance-nya yang cocok | Balasan Widget; AI Activity mencatat `TOOL_CALLED` origin `MCP` |
| W3b | Di `/agent/mcp-servers`, discover ulang lalu jangan aktifkan sebuah Tool baru (atau nonaktifkan `getInvoiceStatus`), lalu ulangi W3a | AI Agent tidak pernah memanggil Tool yang belum diaktifkan/ditetapkan, termasuk bila Customer menyebut namanya; AI menjawab dari Knowledge saja atau eskalasi | Tidak ada `TOOL_CALLED` baru untuk Tool tersebut di AI Activity |
| W3c | Hentikan Business System (`docker compose -f docker-compose.dev.yaml stop business-system` atau matikan proses dev-nya), lalu ulangi W3 | Panggilan Tool yang dipilih AI Agent gagal; Ticket `ESCALATED` dengan alasan `BUSINESS_TOOL_FAILURE` | AI Activity mencatat `TOOL_FAILED`; nyalakan lagi Business System setelah selesai |
| W4 | Minta refund atau `I want to speak to a human` | Ticket `ESCALATED`, acknowledgement dikirim, AI berhenti membalas pesan berikutnya | Admin/Human Agent: `/chat/unassigned` |
| W5 | Dari W4, login Human Agent → Unassigned → Claim | Hanya satu Claim sukses; Ticket `HUMAN_HANDLING`; Handoff dan Escalation Summary tersedia | `/chat` dan Widget menerima perkenalan Human Agent |
| W6 | Dari W5, minta Suggested Reply, edit bila perlu, kirim reply, lalu Resolve | Draft tidak terkirim otomatis; Resolution oleh Human Agent mengirim closing message; Widget read-only | `/chat`; Widget menampilkan tombol Start a new conversation |
| W7 | Pertanyaan W2, kemudian `Yes, that solved it` | AI melakukan Resolution sebagai `CUSTOMER_CONFIRMED` | Widget read-only; trace keputusan `RESOLVE` |
| W8 | Pertanyaan W2, kemudian hanya `thanks` | Tidak boleh langsung Resolution; AI meminta klarifikasi bila perlu | Widget tetap menerima input |
| W9 | Set Follow-Up dan Auto-Resolution ke beberapa detik di `/agent`; kirim W2 lalu diam | Satu Follow-Up terkirim. Bila Auto-Resolution aktif dan Customer tetap diam, Ticket selesai sebagai `CUSTOMER_INACTIVE` | Log Worker, Widget, dan Ticket status |
| W10 | Saat Ticket masih `AI_HANDLING`, login Admin → `/chat/ai-live` → Take over | Streaming AI berhenti, Ticket diambil Admin, Customer menerima perkenalan manusia, timer dibatalkan | `/chat/ai-live` dan Widget |
| W11 | Kirim `.txt` berisi konteks dan pertanyaan terkait | Status Attachment berubah processing → ready dan isinya menjadi konteks Ticket | Widget dan log Worker. PDF/JPEG/PNG memerlukan kredensial Attachment tambahan |
| W12 | Selesaikan sebuah Ticket sebagai Customer tertentu, lalu buat Web Session baru dengan email yang sama dan tanyakan konteks kasus lama | Ticket Knowledge hanya dapat dipakai pada Customer Identity dan Channel sama | Trace retrieval dan jawaban; jangan gunakan sebagai sumber kebijakan baru |
| W13 | Login Admin → Dashboard | Angka Resolution AI (confirmed vs inactive), escalation rate, Ticket/channel, dan Ticket aktif per Human Agent terpisah | `http://localhost:3000/` |
| W14 | Selesaikan sebuah Ticket (lihat W6), lalu buka `/chat/all`, cari nama Customer-nya, dan filter status ke Resolved | Ticket yang sudah Resolved tetap muncul di scope All dengan filter/pencarian; Human Agent hanya melihat Ticket miliknya, Shared Human Queue, dan Ticket yang pernah ia Resolve, sedangkan Admin melihat seluruh Ticket Workspace | `/chat/all` |

Catatan keputusan: bila Admin melakukan Takeover, tetapkan kembali Ticket ke Human Agent sebelum Resolution bila UI/API menolak Admin untuk melakukan Resolution langsung.

## 5. Operator Console dan identitas Operator

Alur ini mencakup fondasi deployment Console dan identitas Operator terpisah
([#219](https://github.com/azarnuzy/supports-ops/issues/219),
[#220](https://github.com/azarnuzy/supports-ops/issues/220)). UI Console belum
memiliki halaman login atau fitur operasional, sehingga autentikasi diuji melalui API.

1. Isi `OPERATOR_AUTH_SECRET` di `.env.local` dengan nilai acak berbeda dari
   `BETTER_AUTH_SECRET`, jalankan migrasi, lalu restart API:

   ```sh
   pnpm db:migrate
   pnpm --filter @repo/api dev
   ```

2. Buat akun Operator melalui prompt lokal:

   ```sh
   pnpm operator:create
   ```

   `pnpm operator:disable` menonaktifkan akun dan mencabut semua sesinya;
   `pnpm operator:reset-password` mengganti password dan mencabut semua sesinya.

3. Jalankan Console pada terminal lain dan buka `http://localhost:3001`:

   ```sh
   pnpm --filter @repo/console dev
   ```

   Shell terbuka, tetapi halamannya masih kosong dan belum menyediakan login UI.

4. Dengan API client atau `curl`, kirim `POST http://localhost:8000/operator/auth/sign-in/email`
   dengan JSON `{"email":"<email-operator>","password":"<password>"}`, origin
   `http://localhost:3001`, dan simpan cookie respons. Kirim cookie itu ke
   `GET http://localhost:8000/operator/session`: respons harus `200` dengan Operator.
   Tanpa cookie, endpoint harus `401`. Cookie sesi Workspace tidak boleh
   mengautentikasi `/operator/session`; cookie Operator juga tidak boleh
   mengautentikasi `GET /session`. Setelah `pnpm operator:disable`, sesi Operator
   lama harus gagal mengakses `/operator/session`.

## 6. Test case AI yang wajib dijalankan

### Unlimited Period Organization (#275)

Verifikasi browser belum dijalankan di sesi implementasi ini (tidak ada browser lokal yang tersedia). Saat lingkungan browser siap:

1. Login sebagai Operator di Console, buka detail Organization yang memiliki dua Workspace, lalu grant Unlimited Period tanpa end date. Coba grant kedua: API harus menolak dengan `409`.
2. Kirim satu AI Turn pada masing-masing Workspace. Di AI Usage, pastikan Model Rate tetap tercatat dan Credits spent nol; saldo Organization tidak berubah.
3. Buat Workspace ketiga saat period aktif, lalu kirim AI Turn di sana. Hasil spend dan saldo harus sama.
4. Tetapkan end date, lalu akhiri period lebih awal. Kirim AI Turn di ketiga Workspace: semuanya kembali mengurangi saldo. Riwayat tiga Turn sebelumnya tetap nol spend.
5. Grant period berakhir singkat, tunggu expiry, lalu ulangi satu Turn. Periksa saldo berkurang dan detail Organization tidak lagi menunjukkan period aktif.

### Overview and Needs Attention scope (#278)

Verifikasi browser belum dijalankan di sesi implementasi ini (tidak ada browser lokal yang tersedia). Saat lingkungan browser siap:

1. Login sebagai Operator, buka Overview: pastikan kartu jumlah Organization tampil terpisah dari jumlah Workspace.
2. Buat satu Organization dengan dua Workspace lalu turunkan saldonya di bawah ambang rendah. Buka Needs Attention: pastikan hanya satu baris risiko finansial muncul di bagian "Organization financial risk" (bukan satu per Workspace), dan aksi Top-Up/Extend Period pada baris itu membuka detail Organization yang benar.
3. Pada salah satu Workspace milik Organization tersebut, buat kondisi operasional (tidak ada aktivitas Customer 14+ hari, Channel nonaktif, atau Knowledge Source gagal). Pastikan baris itu muncul di bagian "Workspace operations" dan aksinya membuka detail Workspace, bukan Organization.
4. Di widget "Needs review" pada Overview, pastikan item finansial Organization dan item operasional Workspace tampil bersisian dengan tautan yang benar ke masing-masing detail.


Eval dijalankan terhadap Workspace live yang ditunjuk `EVAL_WORKSPACE_ID` (bukan corpus
in-memory), memakai Knowledge Source, instructions, dan Tool Assignment Workspace tersebut.
Butuh `COMPLETION_GATEWAY_API_KEY` (atau `OPENROUTER_API_KEY`).

```sh
pnpm eval:ai-agent
```

Suite dibagi per metric: `contains`, `exactmatch`, `relevancy`, `faithfulness`, `geval`,
`decision`, `tool`, `visibility`, `language`, `retriever`, `retrieval`, dan
`negativecontrol`. `negativecontrol` adalah canary yang memang selalu gagal — bila ia lulus,
evaluator atau reporting yang rusak, bukan AI Agent yang sempurna.

Untuk mengisolasi kegagalan, jalankan satu suite, satu kategori Case, atau satu Case:

```sh
pnpm eval:ai-agent faithfulness
pnpm eval:ai-agent staleness
pnpm eval:ai-agent --id=staleness-conflicting-return-window
```

Karena eval memakai Workspace live, tabel W1–W14 tetap dipakai untuk membuktikan integrasi
produk, dan eval untuk mencegah regresi perilaku AI. Inventaris Case dan panduan triage:
[docs/testing/ai-agent-eval-cases.md](ai-agent-eval-cases.md).

## 7. Telemetry di Langfuse

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

## 8. Kriteria selesai

Sebuah run dapat dianggap lengkap bila W1–W10, W13, dan W14 selesai; skenario Operator Console perlu bila #219/#220 berada dalam scope release; W3a–W3c perlu bila alur Tools/MCP (#94) berada dalam scope release; W11 perlu bila Attachment berada dalam scope release, W12 perlu bila Ticket Knowledge berada dalam scope release; seluruh eval telah dijalankan dan negative control tercatat sebagai gagal yang diharapkan. Simpan tautan trace Langfuse yang relevan dan ID Ticket untuk setiap skenario—keduanya cukup untuk mengulang atau menelusuri kegagalan tanpa menyalin percakapan Customer ke dokumen.

Alur Tools/MCP (W3–W3c) tidak memerlukan layanan MCP pihak ketiga: Business System yang sama (`apps/business-system`) berperan sebagai HTTP API dan demo MCP Server.
