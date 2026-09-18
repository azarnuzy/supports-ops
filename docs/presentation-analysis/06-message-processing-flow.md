# 06 — End-to-End Message Processing Flow

Dokumen ini menjawab satu pertanyaan: **apa sebenarnya yang terjadi setelah Customer mengirim message?**

Semua tahapan di bawah ditelusuri dari source code yang benar-benar berjalan, bukan dari dokumentasi atau nama file. Tahap yang tidak ada di implementation tidak dimasukkan, dan beberapa tahap yang biasanya diasumsikan ada ternyata tidak ada — itu dicatat sebagai temuan, bukan disembunyikan.

Setiap tahap diberi label jenisnya:

- **APP** — Application Logic. Kode biasa, hasilnya pasti, tidak ada model AI.
- **AI** — AI Decision. Model yang memutuskan.
- **POLICY** — Policy / Instructions. Aturan yang ditulis sebagai teks prompt atau sebagai konfigurasi Workspace.
- **TOOL** — Tool. Panggilan keluar ke kemampuan yang diberikan ke AI Agent.
- **MCP** — Tool yang berasal dari MCP Server eksternal.
- **ASYNC** — Pekerjaan latar belakang lewat antrean, tidak ada yang menunggu.
- **HUMAN** — Tindakan manusia.

---

## Executive Findings

1. **Tidak ada "context loading" besar sebelum AI berpikir.** Yang disiapkan sebelum model dipanggil hanya empat hal, dan semuanya dimuat bersamaan: teks lampiran yang sudah dibaca, jumlah pertanyaan klarifikasi yang sudah diajukan, Agent Memory, dan daftar Tool. Bukti: `packages/ai-agent/src/turn.ts:115-127`.
2. **Knowledge tidak diambil otomatis. AI Agent harus memanggilnya sendiri sebagai Tool.** `searchKnowledge` adalah Tool, bukan tahap pipeline. Kalau model tidak memanggilnya, tidak ada Knowledge yang masuk. Yang memaksa model memanggilnya adalah kalimat aturan di prompt, bukan kode. Bukti: `apps/api/src/modules/tools/services.ts:33-52`, `packages/ai-agent/src/prompts/reply.ts:20`.
3. **Classification hanya berjalan sekali per Session, yaitu saat belum ada Ticket.** Message kedua dan seterusnya langsung masuk ke AI Agent tanpa diklasifikasi ulang. Bukti: `apps/api/src/modules/widget/services.ts:166-176`.
4. **Keputusan akhir AI selalu satu dari empat**: REPLY, CLARIFY, ESCALATE, RESOLVE. Ini dipaksa oleh schema output, bukan oleh harapan terhadap model. Bukti: `packages/ai-agent/src/reply.ts:25-29`.
5. **Escalation bisa datang dari dua arah**: dari model (ia memilih ESCALATE) atau dari kode (timeout, generation gagal, klarifikasi sudah dua kali, Customer minta manusia). Keduanya menghasilkan Ticket berstatus `ESCALATED` yang identik. Bukti: `packages/ai-agent/src/turn.ts:206-218`, `apps/api/src/modules/widget/router.ts:140-148`.
6. **Web dan WhatsApp memakai otak yang sama tetapi jalur masuk yang berbeda.** Web memanggil AI Agent langsung di proses API dan mengalirkan jawabannya token demi token. WhatsApp menunda 3 detik, menggabungkan message yang menumpuk, menjalankan AI Agent di Worker, lalu mengirim hasil jadi lewat antrean pengiriman. Bukti: `apps/api/src/modules/widget/router.ts:148`, `apps/api/src/modules/whatsapp-config/queue.ts:36-47`, `apps/worker/src/whatsapp-turn.ts:30-149`.
7. **Ada satu jalan pintas deterministik yang hanya ada di Web Widget**: kalau isi message cocok dengan pola "saya mau bicara dengan manusia", Ticket langsung di-escalate tanpa memanggil model sama sekali. Di WhatsApp jalan pintas ini tidak ada — permintaan itu harus ditangkap oleh model. Bukti: `apps/api/src/modules/widget/services.ts:52-56` dipakai di `apps/api/src/modules/widget/router.ts:140`, dan tidak muncul di `apps/worker/src/whatsapp-turn.ts`.
8. **Tool yang mengubah data dijaga oleh panggilan model kedua, bukan oleh regex.** Sebelum Tool yang mengubah data dieksekusi, ada satu panggilan model terpisah yang menilai apakah Customer benar-benar meminta tindakan itu pada giliran ini. Bukti: `apps/api/src/modules/tools/orchestration.ts:95-115`, `packages/ai-agent/src/mutation-intent.ts`.
9. **Setelah Ticket keluar dari status `AI_HANDLING`, AI Agent tidak pernah berbicara lagi ke Customer.** Ini dijaga di beberapa titik sekaligus, termasuk saat penulisan message ke database. Bukti: `apps/api/src/modules/ai-agent/turn.ts:230-236`, `apps/worker/src/whatsapp-turn.ts:56-58`.

---

## A. Canonical happy path

Ini alur yang paling sering terjadi: Customer bertanya sesuatu, AI Agent mencari jawabannya di Knowledge, lalu menjawab.

| # | Tahap | Jenis | Siapa melakukan apa, dan apa yang berubah |
|---|-------|-------|-------------------------------------------|
| 1 | Customer mengirim message | — | Customer mengetik di Web Widget atau di WhatsApp. |
| 2 | Workspace ditentukan dari Channel | APP | Web: `widgetKey` pada request dicari di tabel `WebWidgetConfig`, dan domain pengirim harus terdaftar. WhatsApp: `phone_number_id` dari payload Meta dicari di tabel `WhatsAppConfig`, dan tanda tangan `x-hub-signature-256` harus cocok. Hasilnya: satu `workspaceId`. Tanpa ini tidak ada tahap berikutnya. Bukti: `apps/api/src/modules/widget/services.ts:60-77`, `apps/api/src/modules/whatsapp-config/webhook.ts:47-66`. |
| 3 | Customer Identity dipastikan ada | APP | Web memakai email dari form Pre-Chat, WhatsApp memakai nomor telepon. Satu identitas per Workspace per Channel. Orang yang sama di dua Channel tetap dua identitas. Bukti: `apps/api/src/modules/widget/services.ts:84-106`, `apps/api/src/modules/whatsapp-config/webhook.ts:248-270`. |
| 4 | Session dipastikan ada | APP | Web: Session dibuat saat Pre-Chat dikirim, sebelum message pertama. WhatsApp: Session dibuat saat message pertama masuk, dan Session lama otomatis ditutup kalau 24 jam sejak message terakhir Customer sudah lewat. Bersamaan dengan Session, Agent Memory kosong dibuat. Bukti: `apps/api/src/modules/widget/services.ts:107-128`, `apps/api/src/modules/whatsapp-config/webhook.ts:271-316`. |
| 5 | Message disimpan | APP | Message ditulis ke database dengan nomor urut yang diambil dari penghitung milik Session, jadi urutannya tidak bisa tertukar. Message diberi kunci unik (`idempotencyKey` untuk Web, `messageId` Meta untuk WhatsApp), jadi kiriman ganda tidak menghasilkan dua message. Bukti: `apps/api/src/utils/session-messages.ts`, `apps/api/src/modules/widget/services.ts:391-416`. |
| 6 | Classification — hanya kalau Ticket belum ada | AI | Satu panggilan model memutuskan: ini permintaan support sungguhan, atau cuma sapaan? Kalau sungguhan, model sekaligus menulis judul, memilih category dari daftar milik Workspace, dan menetapkan priority. Bukti: `packages/ai-agent/src/classification.ts:98-170`. |
| 7 | Ticket dibuat | APP | Ticket dibuat dengan judul, category, dan priority dari langkah 6. Semua message sebelumnya di Session itu ikut ditarik ke Ticket, sehingga percakapan pembuka tidak hilang. Dua baris Activity Timeline dicatat: `TICKET_CREATED` dan `CLASSIFIED`. Bukti: `apps/api/src/modules/widget/services.ts:487-570`. |
| 8 | Persiapan giliran AI | APP | Empat hal dimuat sekaligus, bukan berurutan, karena Customer sedang menunggu: teks lampiran yang sudah berhasil dibaca, jumlah klarifikasi yang sudah diajukan di Ticket ini, Agent Memory, dan daftar Tool yang boleh dipakai. Bukti: `packages/ai-agent/src/turn.ts:115-127`. |
| 9 | Tool loadout dipilih | APP | Daftar Tool yang diperlihatkan ke model dipangkas jadi dua kemungkinan. Normalnya Tool pembelian (cart/checkout) disembunyikan. Tool itu baru muncul kalau ada tanda niat membeli di message atau di riwayat percakapan. Ini kode, bukan keputusan AI. Bukti: `packages/ai-agent/src/tools.ts:29-41`. |
| 10 | Prompt disusun | POLICY | Prompt berisi aturan platform, lalu `AiAgent.instructions` milik Admin, lalu jumlah klarifikasi dan isi lampiran di bagian paling akhir. Urutan ini disengaja supaya bagian tetapnya bisa di-cache oleh provider. Instructions Admin secara eksplisit dinyatakan tidak boleh menimpa aturan platform. Bukti: `packages/ai-agent/src/prompts/reply.ts`. |
| 11 | AI memanggil Knowledge | TOOL | Model memanggil `searchKnowledge`. Query-nya diubah jadi embedding, lalu dicari dengan pencarian vektor di PostgreSQL. Yang dikembalikan hanya Chunk milik Workspace itu, yang sudah published, dan yang berlabel Customer-Safe. Maksimal 5 potongan. Bukti: `apps/api/src/modules/tools/orchestration.ts:117-140`, `packages/knowledge/src/vector-store.ts:106-180`. |
| 12 | Tool result dicatat | APP | Setiap panggilan Tool menghasilkan satu baris AI Activity: nama Tool, asalnya, input, output, lama waktunya, berhasil atau gagal. Inilah yang membuat Activity Timeline bisa dibaca manusia. Bukti: `apps/api/src/modules/tools/orchestration.ts:31-73`. |
| 13 | AI memutuskan | AI | Model mengembalikan objek berisi `decision` (REPLY / CLARIFY / ESCALATE / RESOLVE), `content`, dan `escalationReason`. Schema-nya wajib, jadi jawaban bebas tanpa keputusan tidak mungkin terjadi. Bukti: `packages/ai-agent/src/reply.ts:25-29`. |
| 14 | Jawaban mengalir ke layar (Web) | APP | Selama model menulis, tiap potongan teks dikirim ke Widget lewat Redis pub/sub dan SSE, jadi Customer melihat jawaban terbentuk. Aliran ini hanya tampilan; yang dianggap benar adalah message final di database. Bukti: `apps/api/src/modules/ai-agent/turn.ts:96-101`, `apps/widget/src/widget.ts:348-365`. |
| 15 | Jawaban disimpan | APP | Message AI ditulis dalam satu transaksi yang lebih dulu memastikan Ticket masih berstatus `AI_HANDLING`. Kalau statusnya sudah berubah, message tidak jadi ditulis. Bukti: `apps/api/src/modules/ai-agent/turn.ts:228-256`. |
| 16 | Agent Memory diperbarui | APP | Seluruh riwayat model — termasuk panggilan Tool dan hasilnya — disimpan ke Session. Reasoning internal model dibuang dan tidak pernah disimpan. Bukti: `apps/api/src/modules/ai-agent/turn.ts:181-188`. |
| 17 | Timer Follow-Up dipasang | ASYNC | Setelah AI menjawab, dijadwalkan satu pekerjaan tertunda (default 900 detik). Kalau Customer membalas duluan, timer dibatalkan. Bukti: `apps/api/src/modules/ai-agent/turn.ts:114-118`, `apps/api/src/modules/follow-up/queue.ts:27-47`. |
| 18 | Pengiriman (WhatsApp) | ASYNC | Di WhatsApp, message tersimpan berstatus `PENDING` lalu dikirim oleh job terpisah ke Meta Cloud API. Status pengiriman diperbarui saat Meta melapor balik. Bukti: `apps/worker/src/whatsapp-turn.ts:318-420`. |

**Ringkas satu kalimat:** message masuk → Workspace dan Session dipastikan → disimpan → (kalau perlu) diklasifikasi jadi Ticket → AI mengambil Knowledge lewat Tool → AI memilih satu dari empat keputusan → hasilnya disimpan, dikirim, dan timer dipasang.

---

## B. Alternative paths

### B1. Message ternyata bukan permintaan support
**APP + AI.** Classification menjawab "bukan support request". Tidak ada Ticket yang dibuat. Model menuliskan balasan sapaan singkat, dan pasangan message itu tetap disimpan ke Session supaya message berikutnya diklasifikasi dengan konteks lengkap. Bukti: `apps/api/src/modules/widget/services.ts:186-197`, `:418-476`.

Di WhatsApp ada satu perbedaan: kalau Customer yang sama pernah punya Ticket yang sudah RESOLVED di Channel itu, sapaan tetap membuka Ticket baru memakai judul dan category Ticket lamanya. Alasannya, di WhatsApp orang sering menyapa dulu sebelum melanjutkan masalah lama. Bukti: `apps/worker/src/whatsapp-turn.ts:115-138`.

### B2. Knowledge cukup
**AI.** Model memakai isi Tool Result dan menjawab REPLY. Aturan prompt melarang menambah definisi atau angka yang tidak ada di hasil Tool giliran itu. Bukti: `packages/ai-agent/src/prompts/reply.ts:20`.

### B3. Knowledge tidak cukup
**AI + POLICY.** Model wajib ESCALATE dengan alasan `NO_RELEVANT_KNOWLEDGE` atau `LOW_KNOWLEDGE_CONFIDENCE`, bukan menjawab dari pengetahuan modelnya sendiri. Ini aturan prompt, jadi penegakannya bersifat instruksi, bukan pemeriksaan kode. Bukti: `packages/ai-agent/src/prompts/reply.ts:26`.

### B4. Knowledge saling bertentangan
**AI + POLICY.** Kalau dua Knowledge Source published memberi angka berbeda untuk fakta yang sama, model dilarang memilih salah satu, dilarang merata-ratakan, dan dilarang menyebut yang mana yang lama. Yang wajib dilakukan: ESCALATE dengan `CONFLICTING_KNOWLEDGE` dan bilang bahwa Human Agent akan memastikan. Untuk membuat ini mungkin, hasil `searchKnowledge` membawa `sourceTitle` sehingga model bisa mengenali Source yang menyebut dirinya legacy. Bukti: `apps/api/src/modules/tools/services.ts:247-255`, `packages/ai-agent/src/prompts/reply.ts:28`.

### B5. Perlu data Customer yang hidup — Tool berhasil
**TOOL / MCP.** Model memilih Tool berdasarkan deskripsinya. Tool bisa berasal dari tiga tempat: Built-in (milik platform), HTTP Tool (API milik Workspace), atau MCP Tool (dari MCP Server eksternal). Semuanya diperlakukan sama oleh model. Bukti: `apps/api/src/modules/tools/orchestration.ts:117-152`.

### B6. Tool gagal
**TOOL + APP + AI.** Kegagalan tidak membuat proses berhenti. Pesan kegagalan dikembalikan ke model sebagai Tool Result berisi teks `Tool call failed: ...`. Model lalu bisa mencoba lagi atau ESCALATE. Bukti: `packages/ai-agent/src/tools.ts:74-78`.

Ada satu perbaikan otomatis yang khusus: kalau model mengirim argumen yang tidak ada di schema Tool, kode menolaknya lebih dulu dan menyuruh model memanggil ulang dengan bentuk yang benar. Ini lahir dari kasus nyata Shopify `search_catalog` yang mengharapkan `catalog.query` tetapi diisi `query` oleh model. Bukti: `packages/ai-agent/src/tools.ts:86-101`.

Kalau model memilih menyerah, prompt mengarahkan ke ESCALATE dengan alasan `BUSINESS_TOOL_FAILURE`.

### B7. MCP Server tidak tersedia
**MCP + APP.** Dua lapis:
- **Sebelum giliran dimulai.** Tool dari MCP Server yang dimatikan, atau yang hasil discovery-nya bukan `CURRENT`, tidak pernah masuk ke daftar Tool yang diperlihatkan ke model. Jadi model tidak tahu Tool itu ada. Bukti: `apps/api/src/modules/tools/services.ts:262-271`.
- **Saat dipanggil.** Kalau server tidak bisa dihubungi, panggilan gagal dan jatuh ke jalur B6. Ada juga batas keras: hasil MCP di atas 64 KB ditolak. Bukti: `apps/api/src/modules/mcp/services.ts:207-217`.

### B8. Data bisnis tidak ditemukan
**AI.** Ini bukan kegagalan Tool. Tool berhasil, hanya saja isinya kosong. Prompt menangani ini secara eksplisit: kalau Customer menyebut produk tertentu dan tidak ada yang cocok, model harus bilang tidak ditemukan dan meminta link atau SKU — dilarang menawarkan produk lain sebagai gantinya. Untuk pencarian katalog, model juga diminta mengulang pencarian tanpa filter sebelum menyatakan produk tidak ada. Bukti: `packages/ai-agent/src/prompts/reply.ts:22`.

### B9. Permintaan ambigu
**AI + APP.** Model memilih CLARIFY. Jumlah klarifikasi yang sudah diajukan dihitung dari baris AI Activity `CLARIFICATION_ASKED` dan disuntikkan ke prompt setiap giliran. Setelah dua kali, klarifikasi ketiga otomatis diubah jadi Escalation oleh kode, apa pun yang dipilih model. Bukti: `apps/api/src/modules/ai-agent/turn.ts:43-47`, `packages/ai-agent/src/turn.ts:206-213`.

### B10. Customer minta manusia
Dua jalur berbeda, dan ini asimetri nyata antar Channel:
- **Web Widget — APP.** Isi message dicek dengan pola teks sebelum model dipanggil sama sekali. Kalau cocok, Ticket langsung di-escalate dengan alasan `CUSTOMER_REQUESTED_HUMAN`. Tidak ada biaya model, tidak ada kemungkinan model salah menilai. Bukti: `apps/api/src/modules/widget/services.ts:52-56`, `apps/api/src/modules/widget/router.ts:140-146`.
- **WhatsApp — AI.** Pola teks itu tidak dipakai. Permintaan harus ditangkap model dan diubah jadi ESCALATE dengan alasan yang sama.

### B11. Ada lampiran
**ASYNC + AI.** Lampiran tidak ikut giliran AI sampai isinya berhasil dibaca.
- **Web:** file diunggah ke object storage, lalu satu job membaca isinya. PDF dan gambar lewat OCR Mistral, suara lewat transcription, teks biasa dibaca langsung. Setelah semua lampiran pada satu message selesai, Worker memanggil endpoint internal API untuk memulai giliran AI. Bukti: `apps/worker/src/attachment-process.ts:28-118`, `apps/api/src/app.ts:25-36`.
- **WhatsApp:** file ditarik dari Meta lebih dulu, karena URL milik Meta cepat kedaluwarsa. Pembacaannya dilakukan di dalam giliran itu sendiri, bukan sebagai job terpisah. Bukti: `apps/api/src/modules/whatsapp-config/webhook.ts:178-232`, `apps/worker/src/whatsapp-turn.ts:51-55`.

Transkrip suara selalu diberi label sebagai isi lampiran, tidak pernah ditulis ulang seolah-olah Customer yang mengetiknya. Bukti: `apps/worker/src/whatsapp-turn.ts:233-245`.

Kalau semua lampiran gagal dibaca dan tidak ada teks sama sekali, AI Agent tidak dijalankan. Yang dikirim adalah pesan yang memberitahu Customer file mana yang tidak terbaca. Bukti: `apps/worker/src/whatsapp-turn.ts:60-73`.

### B12. Customer mengonfirmasi masalahnya selesai
**AI + APP.** Model memilih RESOLVE. Prompt membedakan dengan tegas: "terima kasih" saja bukan konfirmasi, itu REPLY. Kalau tidak jelas, model harus CLARIFY dan bertanya langsung. Setelah RESOLVE, kode menutup Ticket dan Session, membatalkan semua timer, dan mengantre Ticket itu untuk diindeks jadi Ticket Knowledge. Bukti: `packages/ai-agent/src/prompts/reply.ts:29`, `apps/api/src/modules/ai-agent/turn.ts:284-330`.

### B13. Customer diam
**ASYNC.** Dua timer berurutan, keduanya memeriksa ulang kondisi saat dijalankan supaya kalah dari balasan Customer yang datang belakangan:
1. Follow-Up (default 900 detik): AI Agent mengirim pertanyaan "apakah jawaban saya sudah menyelesaikan masalahnya?".
2. Auto-Resolution (default 3600 detik): kalau Follow-Up tetap tidak dijawab, Ticket ditutup dengan alasan `CUSTOMER_INACTIVE`.

Bukti: `apps/worker/src/follow-up.ts:88-160`, `:164-225`.

### B14. Human mengambil alih
Lihat bagian I.

### B15. WhatsApp sebagai Channel sumber
Perbedaan nyata dibanding Web, semuanya terbukti di kode:

| Hal | Web Widget | WhatsApp |
|-----|-----------|----------|
| Pemicu giliran AI | Langsung, di dalam proses API | Job tertunda 3 detik di Worker |
| Message beruntun | Satu message satu giliran | Semua message baru sejak balasan terakhir digabung jadi satu giliran |
| Jawaban sampai ke Customer | Mengalir token demi token lewat SSE | Message utuh, dikirim lewat job pengiriman |
| Permintaan bicara dengan manusia | Dicek pola teks sebelum model | Hanya lewat keputusan model |
| Batas waktu | Tidak ada | Semua timer dipotong agar tidak melewati 24 jam sejak message terakhir Customer |
| Di luar 24 jam | Tidak berlaku | Yang boleh keluar hanya Message Template |

Bukti: `apps/api/src/modules/whatsapp-config/queue.ts:36-47`, `apps/worker/src/whatsapp-turn.ts:42-50`, `packages/channels/src/index.ts:281-310`.

---

## C. Decision points

Sembilan titik tempat alur benar-benar bercabang:

1. **Apakah Channel ini dikenali dan sah?** (APP) — kalau tidak, request ditolak sebelum apa pun disimpan.
2. **Apakah Session masih hidup?** (APP) — di WhatsApp, Session yang lewat 24 jam ditutup dan Ticket-nya diselesaikan oleh platform.
3. **Apakah Ticket sudah ada?** (APP) — kalau sudah, classification dilewati sepenuhnya.
4. **Apakah ini permintaan support?** (AI) — menentukan Ticket dibuat atau tidak.
5. **Apakah Customer minta manusia?** (APP di Web, AI di WhatsApp).
6. **Tool loadout mana?** (APP) — menentukan apakah Tool pembelian terlihat oleh model.
7. **Apakah Tool ini mengubah data, dan apakah Customer benar-benar memintanya?** (AI, panggilan model terpisah).
8. **Keputusan utama: REPLY / CLARIFY / ESCALATE / RESOLVE** (AI).
9. **Apakah Ticket masih `AI_HANDLING` saat jawaban hendak ditulis?** (APP) — kalau sudah tidak, jawaban dibuang.

---

## D. AI-driven decisions

Ada **empat** panggilan model yang berbeda di sepanjang alur satu Ticket. Ini penting untuk cerita biaya: satu message Customer tidak berarti satu panggilan model.

| Panggilan | Kapan | Apa yang diputuskan | Bukti |
|-----------|-------|---------------------|-------|
| Classification | Sekali per Session, saat Ticket belum ada | support atau bukan, judul, category, priority | `packages/ai-agent/src/classification.ts:98` |
| Reply | Setiap giliran AI | REPLY / CLARIFY / ESCALATE / RESOLVE, isi jawaban, alasan escalation, dan semua panggilan Tool | `packages/ai-agent/src/reply.ts:50` |
| Mutation intent | Hanya saat Tool yang mengubah data hendak dipanggil | apakah Customer benar-benar meminta tindakan itu sekarang | `packages/ai-agent/src/mutation-intent.ts:26` |
| Escalation Summary | Saat Human Agent melakukan Claim | ringkasan situasi untuk Human Agent | `apps/api/src/modules/tickets/services.ts:498-512` |

Ditambah dua panggilan yang hanya terjadi di fase manusia: Suggested Reply dari AI Copilot, dan embedding untuk setiap pencarian.

---

## E. Deterministic decisions

Hal-hal yang **tidak** diserahkan ke model:

- **Batas klarifikasi.** CLARIFY ketiga otomatis jadi Escalation. `packages/ai-agent/src/turn.ts:206-213`.
- **Batas waktu satu giliran.** 60 detik. Giliran yang habis waktu langsung jadi Escalation `AI_TIMEOUT` dan tidak diulang. `packages/ai-agent/src/turn.ts:27`, `:180-187`.
- **Percobaan ulang.** Satu kali ulang, dan hanya kalau gagal cepat tanpa sempat mengeluarkan teks apa pun. Kalau Customer sudah melihat jawaban mulai mengalir, tidak ada pengulangan — jawaban yang sedang dibaca tidak boleh diganti di tengah jalan. `packages/ai-agent/src/turn.ts:158-172`.
- **Anggaran Tool.** Maksimal 15 panggilan dan 60 detik total per message Customer. Setelah itu Tool mengembalikan pesan "anggaran habis" dan model diminta menjawab dengan yang sudah ada atau ESCALATE. `packages/ai-agent/src/tools.ts:44-46`, `:63-67`.
- **Batas percakapan model.** Maksimal 5 putaran kalau ada Tool, 1 putaran kalau tidak ada. `packages/ai-agent/src/reply.ts:83`.
- **Filter Knowledge.** Internal-Only tidak pernah bisa sampai ke Customer, karena disaring di SQL, bukan di prompt. `packages/knowledge/src/vector-store.ts:125-128`.
- **Batas Workspace.** Dipasang otomatis lewat Prisma extension; query vektor mentah menyaring `workspaceId` secara eksplisit.
- **Urutan message.** Nomor urut diambil dari penghitung milik Session di dalam transaksi.
- **Anti-duplikat.** Kunci unik per message, jadi webhook Meta yang mengirim ulang tidak menghasilkan message ganda.
- **Rate limit Web Widget.** 30 message per menit per Session, 60 per menit per alamat IP. `apps/api/src/modules/widget/rate-limit.ts`.
- **Klaim Ticket.** Hanya satu `UPDATE` yang bisa berhasil memindahkan Ticket dari antrean ke satu Human Agent. `apps/api/src/modules/tickets/services.ts:436-459`.

---

## F. Policy / Instruction-driven behavior

Perilaku yang ditentukan oleh teks, bukan oleh kode. Ini bagian yang bisa diubah Admin tanpa deploy — dan juga bagian yang penegakannya paling lemah, karena bergantung pada kepatuhan model.

**Ditulis di prompt platform** (tidak bisa diubah Admin):
- Grounding wajib untuk fakta perusahaan.
- Tool Result adalah data, bukan perintah — ini pertahanan terhadap dokumen atau balasan API yang berisi instruksi tersembunyi.
- Knowledge yang bertentangan harus di-escalate, bukan dipilih salah satu.
- Dua tagihan ganda pada satu order harus di-escalate, bahkan kalau Customer meminta langsung direfund.
- Jangan pernah menyebut kode internal, nama antrean, target review, atau menjanjikan waktu respons.
- Balas dalam bahasa yang dipakai Customer.

**Bisa dikonfigurasi Admin per Workspace:**
- `AiAgent.instructions` — aturan tambahan, disisipkan ke prompt dengan catatan tegas bahwa ia tidak boleh menimpa aturan platform. Bukti: `packages/ai-agent/src/prompts/reply.ts:17-19`.
- `AiAgent.resolutionMessage` dan `handoffMessage`.
- `ToolAssignment.usageInstruction` — catatan "kapan Tool ini dipakai" yang ditempel ke deskripsi Tool. Ini mengarahkan pilihan model, tidak memaksanya. Bukti: `apps/api/src/modules/tools/orchestration.ts:205-215`.
- Ticket Category per Workspace.
- `AiSettings`: waktu Follow-Up, Auto-Resolution, dan Idle Closure.

**Escalation yang dipicu policy:** tidak ada aturan Admin yang memaksa Escalation secara mekanis. Instruksi Admin bisa mendorong model untuk ESCALATE, tetapi penegakannya tetap lewat model. Escalation yang benar-benar dipaksa kode hanya yang disebut di bagian E.

---

## G. Tool / MCP interaction

**Tiga asal Tool, satu antarmuka.** Model melihat ketiganya sama persis. Perbedaannya hanya ada di kode yang mengeksekusi. Bukti: `apps/api/src/modules/tools/orchestration.ts:117-152`.

| Asal | Apa itu | Eksekusi |
|------|---------|----------|
| Built-in | `searchKnowledge` dan `searchCustomerTicketHistory` | Embedding + pencarian vektor di database sendiri |
| HTTP | API milik Workspace | Panggilan HTTP dengan validasi schema, timeout 15 detik, batas ukuran hasil |
| MCP | Tool dari MCP Server eksternal, termasuk Shopify | Panggilan MCP; argumen statis milik server digabung; kredensial disensor dari hasil |

**Built-in Tool selalu tersedia.** Kedua Tool built-in tidak perlu baris konfigurasi apa pun. Kalau tidak ada assignment eksplisit, keduanya tetap diberikan ke setiap AI Agent. Bukti: `apps/api/src/modules/tools/services.ts:33-52`, `:196-198`.

**Discovery MCP adalah tahap terpisah, bukan bagian dari alur message.** Admin menghubungkan MCP Server, sistem menarik daftar Tool, lalu Admin menyalakan dan memberi risk level satu per satu, lalu menugaskannya ke AI Agent. Semua itu terjadi jauh sebelum Customer mengirim message. Saat message masuk, yang tersisa hanyalah membaca daftar. Bukti: `apps/api/src/modules/mcp/services.ts`, `scripts/seed-demo.ts:169-210`.

**Tiga tingkat risiko:**
- `READ_ONLY` — langsung boleh dipanggil.
- `MUTATING` — perlu permintaan eksplisit Customer pada giliran ini, atau konfirmasi atas usulan yang baru saja disampaikan AI Agent.
- `MUTATING_IRREVERSIBLE` — wajib dua langkah. AI Agent harus mengusulkan tindakan spesifik lebih dulu di satu message, lalu Customer mengonfirmasi di message berikutnya. Permintaan pertama saja tidak pernah cukup.

Penjaganya adalah panggilan model terpisah, bukan pencocokan kata. Bukti: `apps/api/src/modules/tools/orchestration.ts:95-115`, `packages/ai-agent/src/prompts/mutation-intent.ts`.

**Shopify.** Tidak ada satu baris kode Shopify di repository ini. Shopify masuk sepenuhnya sebagai baris konfigurasi MCP Server pada Workspace. Jejaknya di kode hanya berupa penyesuaian yang lahir dari pemakaian nyata: pola nama Tool cart/checkout, perbaikan argumen yang salah bentuk, dan aturan prompt tentang checkout yang memakai semantik PUT. Bukti: `packages/ai-agent/src/tools.ts:22-24`, `:86-101`, `packages/ai-agent/src/prompts/reply.ts:24`.

---

## H. Failure paths

| Yang gagal | Apa yang terjadi | Customer melihat apa | Jenis |
|------------|------------------|----------------------|-------|
| Classification gagal | Message tidak disimpan sebagai Ticket; API mengembalikan 502 | Widget menampilkan error, message bisa dikirim ulang | APP |
| API key tidak dikonfigurasi | Giliran AI langsung jadi Escalation `AI_GENERATION_FAILED` | Pesan bahwa ada kendala teknis dan Ticket diteruskan ke Human Agent | APP |
| Generation gagal | Satu kali ulang kalau belum ada teks yang keluar; kalau tetap gagal, Escalation `AI_GENERATION_FAILED` | Sama seperti di atas | APP |
| Giliran lewat 60 detik | Escalation `AI_TIMEOUT`, tanpa pengulangan | Pesan bahwa pemeriksaan tidak selesai tepat waktu | APP |
| Tool gagal | Pesan kegagalan dikembalikan ke model sebagai Tool Result | Bergantung keputusan model: coba lagi, atau Escalation `BUSINESS_TOOL_FAILURE` | TOOL + AI |
| Anggaran Tool habis | Tool berhenti melayani dan mengembalikan pesan anggaran habis | Model menjawab seadanya atau escalate | APP |
| MCP Server mati | Sama seperti Tool gagal | Sama | MCP |
| Hasil MCP > 64 KB | Ditolak sebagai kegagalan Tool | Sama | APP |
| Lampiran tidak terbaca | Status lampiran jadi FAILED; teks kegagalan ikut masuk ke konteks AI dengan perintah memberitahu Customer | Diberitahu file mana yang tidak terbaca | ASYNC |
| Pengiriman WhatsApp gagal sementara | Diulang sampai 6 kali dengan jeda menaik | Tidak terlihat | ASYNC |
| Pengiriman WhatsApp gagal permanen | Message ditandai FAILED dan ditampilkan ke Human Agent | Tidak menerima message | ASYNC |
| Access Token WhatsApp mati | Ditandai di konfigurasi Workspace agar Admin tahu | Tidak menerima message | ASYNC |
| Ringkasan Escalation gagal | Handoff tetap jalan; ringkasan ditandai FAILED | Tidak terlihat sama sekali | APP |
| Indeks Ticket Knowledge gagal | Ticket tetap RESOLVED; job diulang | Tidak terlihat | ASYNC |

**Pola yang konsisten:** kegagalan apa pun pada jalur AI berakhir di Escalation, tidak pernah di jawaban yang dikarang. Dan kegagalan pada pekerjaan latar belakang tidak pernah membatalkan hal yang sudah benar di database.

---

## I. Human handoff boundary

Ini batas terpenting di seluruh sistem: **setelah Ticket keluar dari `AI_HANDLING`, AI Agent berhenti berbicara ke Customer, selamanya, untuk Ticket itu.**

**Tiga cara Ticket menyeberangi batas:**
1. **Escalation** — AI Agent menyerahkan Ticket. Ticket masuk Shared Human Queue tanpa pemilik. Status `ESCALATED`.
2. **Takeover** — Admin menarik Ticket dari AI Agent sebelum ada Escalation. Generation yang sedang berjalan dihentikan saat itu juga. Status `HUMAN_HANDLING`. Bukti: `apps/api/src/modules/tickets/services.ts:381-431`.
3. **Claim** — Human Agent mengambil Ticket dari antrean. Status `HUMAN_HANDLING`.

**Bagaimana batas itu ditegakkan — empat lapis, bukan satu:**
- Penulisan message AI dibungkus transaksi yang lebih dulu memastikan status masih `AI_HANDLING`. Kalau tidak, message tidak jadi ditulis. `apps/api/src/modules/ai-agent/turn.ts:230-236`.
- Escalation dan Resolution juga memakai transisi bersyarat yang sama, jadi dua jalur tidak bisa menang bersamaan.
- Takeover menghapus Ticket dari daftar "sedang generate", sehingga aliran teks yang sedang berjalan berhenti sampai ke Customer. `apps/api/src/modules/widget/realtime.ts:44-48`.
- Di WhatsApp, giliran langsung berhenti kalau Ticket sudah tidak `AI_HANDLING`. `apps/worker/src/whatsapp-turn.ts:56-58`.

**Handoff dibuat saat Claim, bukan saat Escalation.** Alasannya jelas: Customer mungkin masih menulis selama menunggu di antrean, jadi ringkasan yang dibuat di saat Escalation bisa sudah basi. Bukti: `apps/api/src/modules/tickets/services.ts:461-465`.

Dua hal terjadi saat Claim, dan urutannya disengaja: message perkenalan Human Agent dikirim lebih dulu, baru ringkasan dibuat. Kalau pembuatan ringkasan gagal, Ticket tetap milik Human Agent itu.

**Yang masih dilakukan AI setelah batas:** AI Copilot. Ia membantu Human Agent, boleh membaca Knowledge Internal-Only, dan hanya membuat draft kalau diminta. Ia tidak bisa mengirim message ke Customer dan tidak bisa mengambil Ticket kembali. Bukti: `apps/api/src/modules/tickets/services.ts:772-830`.

---

## J. Async processing

Semua yang berjalan tanpa ada orang menunggu, lewat antrean BullMQ di Redis:

| Pekerjaan | Dipicu oleh | Yang dikerjakan |
|-----------|-------------|-----------------|
| WhatsApp turn | Webhook Meta, tertunda 3 detik | Menjalankan giliran AI untuk WhatsApp |
| WhatsApp delivery | Setiap message keluar | Mengirim ke Meta, 6 kali percobaan |
| Attachment process | Unggahan lampiran Web | OCR / transcription, lalu memicu giliran AI |
| Follow-Up | Setiap balasan AI | Bertanya apakah masalahnya sudah selesai |
| Auto-Resolution | Follow-Up terkirim | Menutup Ticket kalau tetap tidak dijawab |
| Idle Closure | Escalation atau Claim | Menutup Ticket yang Customer-nya diam terlalu lama |
| Ticket Knowledge index | Ticket RESOLVED | Mengubah Ticket jadi Chunk yang bisa dicari Customer yang sama |
| Knowledge ingest | Admin mengunggah Knowledge Source | Ekstraksi, chunking, embedding, indexing |
| Session email | Pre-Chat Web | Mengirim Session Link |

**Satu pola yang dipakai semua timer:** pekerjaan tertunda memeriksa ulang kondisinya di dalam transaksi saat ia dijalankan. Jadi balasan Customer, Takeover, Claim, atau balasan AI yang lebih baru selalu menang melawan timer yang baru saja jatuh tempo. Bukti: komentar dan implementasi di `apps/worker/src/follow-up.ts:86-96`.

**Realtime bukan antrean.** Redis pub/sub dan SSE hanya mengumumkan sesuatu yang sudah benar di database. Kalau koneksi putus, tidak ada kebenaran yang hilang.

---

## K. Simplified presentation flow

Versi yang harus bisa dipahami dalam 1–2 menit. Target: **satu flowchart, maksimal tiga belas kotak.**

```
                    Customer mengirim message
                    (Web Widget atau WhatsApp)
                              │
                    ┌─────────▼─────────┐
                    │  Workspace, Session,│   APP
                    │  Message disimpan   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Sudah ada Ticket? │   APP
                    └────┬─────────┬────┘
                    belum│         │sudah
                    ┌────▼────┐    │
                    │Klasifikasi│  │          AI
                    │support?  │   │
                    └──┬────┬──┘   │
                 bukan │    │ ya   │
              ┌────────▼─┐  │      │
              │Balas sapaan│ │      │
              │Tidak ada   │ └──┬───┘
              │Ticket      │    │
              └────────────┘ ┌──▼──────────┐
                             │Ticket dibuat│  APP
                             └──┬──────────┘
                                │
                    ┌───────────▼────────────┐
                    │   AI Agent berpikir     │  AI
                    │  ┌──────────────────┐   │
                    │  │ Cari Knowledge   │   │  TOOL
                    │  │ Panggil Tool/MCP │   │  TOOL/MCP
                    │  │ (maks 15, 60 dtk)│   │
                    │  └──────────────────┘   │
                    └───────────┬────────────┘
                                │
        ┌──────────┬────────────┼────────────┬──────────┐
        │          │            │            │          │
   ┌────▼───┐ ┌────▼────┐ ┌─────▼────┐ ┌─────▼─────┐   │
   │ REPLY  │ │ CLARIFY │ │ ESCALATE │ │  RESOLVE  │   │
   └────┬───┘ └────┬────┘ └─────┬────┘ └─────┬─────┘   │
        │          │            │            │          │
        │      2x → ESCALATE    │            │          │
        │                       │            │          │
        └──────────┬────────────┘            │          │
                   │                    ┌────▼──────┐   │
           ┌───────▼────────┐           │Ticket &   │   │
           │ Follow-Up timer │  ASYNC    │Session    │   │
           │ → Auto-Resolve  │           │ditutup    │   │
           └────────────────┘            └───────────┘   │
                                                          │
                              ┌───────────────────────────▼──┐
                              │  Shared Human Queue           │
                              │  Human Agent Claim            │  HUMAN
                              │  AI Agent berhenti bicara     │
                              └───────────────────────────────┘
```

**Tiga kalimat untuk menemani gambar ini:**

1. "Sebelum AI berpikir, sistem sudah memastikan tiga hal secara deterministik: ini Workspace siapa, ini percakapan yang mana, dan message-nya tersimpan urut."
2. "AI Agent tidak diberi jawaban. Ia diberi Tool, dan ia harus mencari sendiri — kalau tidak ketemu, ia wajib menyerahkan ke manusia, bukan mengarang."
3. "Apa pun yang terjadi, hasilnya selalu satu dari empat: menjawab, bertanya balik, menyerahkan ke manusia, atau menutup."

**Yang sebaiknya tidak digambar:** streaming SSE, nomor urut message, rate limit, idempotency, isi Redis, Prisma extension, retry policy per job. Semuanya nyata dan penting, tetapi tidak membantu audience memahami alurnya dalam dua menit. Simpan sebagai jawaban kalau ditanya.

---

## L. Bagian yang masih perlu diverifikasi

1. **Seberapa sering model benar-benar memanggil `searchKnowledge`.** Grounding adalah aturan prompt, bukan pemeriksaan kode. Tidak ada tempat di alur yang menolak REPLY karena tidak ada Tool Result. Data AI Activity bisa menjawab ini, tetapi belum diukur di repository. Ini pertanyaan paling mungkin muncul dari audience technical.
2. **Berapa banyak Escalation yang berasal dari model dibanding dari kode.** Angka ini ada di metadata `ESCALATED`, tetapi belum ada laporan yang memecahnya. Penting karena mengubah cerita: `AI_TIMEOUT` yang banyak adalah masalah infrastruktur, sementara `NO_RELEVANT_KNOWLEDGE` yang banyak adalah masalah isi Knowledge.
3. **Bentuk sebenarnya Tool Shopify di Workspace demo.** Nama Tool, risk level, dan `usageInstruction` ada sebagai data, bukan di repository. Kalau demo akan menampilkan pembelian atau checkout, ini harus dilihat langsung dari Workspace.
4. **Apakah ada Tool `MUTATING_IRREVERSIBLE` yang benar-benar aktif.** Kalau tidak ada, penjagaan dua langkah adalah kemampuan yang belum pernah dijalankan di demo, dan sebaiknya disebut sebagai desain, bukan sebagai sesuatu yang bisa diperagakan.
5. **Perilaku penggabungan message WhatsApp.** Jeda 3 detik terbukti di kode, tetapi seberapa sering Customer nyata mengirim beberapa message dalam jendela itu belum diukur.
6. **Apakah OCR dan transcription menyala di production.** Keduanya butuh `MISTRAL_API_KEY`. Kalau kunci tidak ada, setiap lampiran selain teks biasa akan gagal dibaca.
7. **Nilai `AiSettings` di Workspace demo.** Semua angka yang disebut di dokumen ini adalah nilai default di kode (900 / 3600 / 28800 detik). Nilai sesungguhnya adalah data Workspace.

---

## Kenapa ini penting untuk presentasi

- **Untuk Business:** menunjukkan bahwa "AI menjawab Customer" bukan satu kotak ajaib, melainkan rantai yang punya titik berhenti jelas. Empat hasil akhir mudah diingat dan langsung terhubung ke metrik: berapa yang dijawab, berapa yang diserahkan ke manusia, berapa yang selesai.
- **Untuk Product:** memperlihatkan di mana Admin punya kendali nyata (Instructions, Knowledge, Tool, timer) dan di mana tidak (batas klarifikasi, timeout, batas Workspace).
- **Untuk Engineering:** memperlihatkan pilihan arsitektur yang jelas — retrieval sebagai Tool dan bukan sebagai pipeline, keputusan sebagai schema dan bukan sebagai teks bebas, dan batas manusia yang dijaga di lapisan database, bukan hanya di prompt.
- **Untuk Architect:** pola "setiap kegagalan berujung Escalation" adalah jawaban desain terhadap pertanyaan paling sering tentang AI di customer support: apa yang terjadi kalau AI-nya salah.

## Hal yang sebaiknya tidak dimasukkan ke presentasi

- Nomor urut message dan penghitung per Session.
- Idempotency key dan penanganan race condition.
- Isi lengkap prompt (terlalu panjang untuk dibaca di layar; ambil dua atau tiga kalimat aturan saja).
- Detail konfigurasi antrean BullMQ.
- Mekanisme prompt caching dan urutan penyusunan prompt. Ini menarik untuk bagian Cost, bukan untuk bagian flow.
- Penjagaan alamat jaringan internal untuk HTTP Tool dan MCP.

## Implemented vs Partial vs Demo vs Intent

**IMPLEMENTED** — Workspace resolution di kedua Channel; Session dan Agent Memory; penyimpanan message dan urutannya; Classification; pembuatan Ticket; giliran AI dengan empat keputusan; Tool calling untuk Built-in, HTTP, dan MCP; penjagaan Tool yang mengubah data; batas klarifikasi, timeout, dan anggaran Tool; Escalation dengan alasan tetap; Claim, Takeover, Handoff, Escalation Summary; Follow-Up, Auto-Resolution, Idle Closure; pemrosesan lampiran; indeks Ticket Knowledge; streaming SSE di Web; pengiriman WhatsApp dengan status dan retry; Activity Timeline.

**PARTIALLY IMPLEMENTED** — Grounding. Penegakannya berupa instruksi prompt, dan tidak ada pemeriksaan kode yang menolak jawaban tanpa Tool Result. Yang deterministik hanya penyaringan Internal-Only, yang berjalan di SQL.

**DEMO / DEVELOPMENT INFRASTRUCTURE** — `apps/business-system` beserta MCP Server demo-nya, dan `scripts/seed-demo.ts`. Menurut project owner, di production perannya digantikan Shopify MCP Server.

**ARCHITECTURAL INTENT** — Tidak ada tahap di alur ini yang hanya berupa niat. Semua yang ditulis di dokumen ini benar-benar dieksekusi.

## Kandidat visual

1. **Flowchart utama** (bagian K) — satu gambar untuk seluruh sesi. Warnai kotak menurut jenisnya: APP, AI, TOOL/MCP, ASYNC, HUMAN.
2. **Empat hasil akhir** — satu slide berisi empat kotak saja, dengan satu kalimat contoh di tiap kotak. Ini yang paling mudah diingat audience.
3. **Garis batas manusia** — gambar satu garis vertikal. Sebelah kiri AI Agent berbicara, sebelah kanan tidak pernah lagi. Tunjukkan tiga cara menyeberang dan satu hal yang tersisa (AI Copilot).
4. **Perbandingan Web dan WhatsApp** — tabel lima baris dari bagian B15. Menunjukkan bahwa otaknya sama dan yang berbeda hanya transport.
5. **Tiga asal Tool, satu antarmuka** — gambar model di tengah dengan tiga panah keluar berlabel Built-in, HTTP, MCP. Tambahkan catatan: "Shopify masuk lewat jalur MCP, tanpa satu baris kode pun."

## Pertanyaan untuk analisis lanjutan

1. Dari data AI Activity Workspace demo: berapa persen giliran AI yang memanggil `searchKnowledge`, dan berapa persen REPLY yang terjadi tanpa Tool Result sama sekali?
2. Distribusi `escalationReason` yang sebenarnya — mana yang paling sering?
3. Berapa panggilan model rata-rata per Ticket, dan berapa yang berasal dari mutation intent? Ini masuk ke analisis biaya.
4. Berapa lama waktu dari message Customer sampai token pertama di Web, dan sampai message terkirim di WhatsApp?
5. Apakah ada Ticket yang pernah menyentuh batas 15 panggilan Tool atau 60 detik?
6. Berapa banyak Ticket yang ditutup Auto-Resolution dibanding yang dikonfirmasi Customer? Angka ini menentukan seberapa jujur klaim efektivitas AI.
