# 02 — Presentation Narrative Analysis

Tanggal analisis: 18 September 2026  
Target durasi: 15–20 menit  
Audience: Software Engineer, Technical Lead / Architect, Product, dan Business Stakeholder

## Executive Findings

Cerita terkuat adalah perjalanan satu masalah Customer dari pesan pertama sampai penyelesaian. Demo perlu muncul lebih awal agar audience lebih dahulu melihat hasil bisnisnya. Penjelasan arsitektur, AI, Observability, Evaluation, dan Cost kemudian menjawab pertanyaan yang muncul dari demo: bagaimana sistem mengambil keputusan, bagaimana keputusan itu dibatasi, bagaimana kegagalan diperiksa, dan apakah cara kerja ini layak dijalankan.

Technical differentiator utama SupportOps bukan penggunaan LLM. Pembeda utamanya adalah AI Agent dan Human Agent bekerja dalam satu lifecycle Ticket yang dikendalikan aplikasi. AI memakai Knowledge yang published dan data langsung dari Tool. Ketika AI tidak aman untuk melanjutkan, status Ticket menghentikan AI dan memindahkan pekerjaan ke manusia dengan konteks yang tetap utuh.

Workspace demo memperkuat cerita karena sudah berisi Knowledge, HTTP Tool, Shopify MCP Tool, AI Instructions, Evaluation, user, dan konfigurasi WhatsApp. WhatsApp juga sudah dapat digunakan pada environment local dan production untuk chat, gambar, file, dan penanganan oleh Human Agent. Presentasi tidak perlu menghabiskan waktu untuk setup. Audience dapat langsung melihat sistem yang sudah beroperasi.

Evidence utama: `packages/ai-agent/src/turn.ts`, `apps/api/src/modules/ai-agent/turn.ts`, `apps/api/src/modules/tickets/services.ts`, `apps/api/src/modules/tools/`, `apps/api/src/modules/mcp/`, `apps/api/src/evals/`, `scripts/cost-measure.ts`, `deploy/compose.prod.yaml`.

## A. Presentation thesis

Satu ide yang harus diingat audience:

> SupportOps membuat AI berguna untuk operasi customer support karena AI tidak bekerja sendirian: jawabannya dibatasi oleh Knowledge dan Tool, tindakannya tercatat, kualitasnya diuji, biayanya diukur, dan manusia mengambil alih saat AI tidak aman untuk melanjutkan.

Kalimat ini menghubungkan nilai bisnis dan desain teknis. SupportOps bukan sekadar antarmuka chat yang memanggil model. Produk ini mengelola pekerjaan support dari awal sampai selesai.

## B. Audience mental journey

Audience perlu bergerak melalui enam perubahan pemahaman:

1. **Dari masalah operasional ke kebutuhan produk.** Pertanyaan support berulang perlu dijawab cepat, tetapi jawaban tentang kebijakan, order, dan tagihan tidak boleh ditebak.
2. **Dari janji ke bukti.** Demo menunjukkan AI menjawab dengan Knowledge atau data bisnis, lalu menyerahkan Ticket ketika batasnya tercapai.
3. **Dari “chatbot” ke sistem kerja.** Audience melihat bahwa Channel, Ticket, AI Agent, Tool, dan Human Agent memiliki peran yang berbeda.
4. **Dari kemampuan AI ke kontrol AI.** Prompt membantu mengarahkan model, tetapi status Ticket, izin Tool, visibilitas Knowledge, dan aturan mutasi ditegakkan oleh aplikasi.
5. **Dari kontrol ke trust.** AI Activity dan Telemetry menjelaskan apa yang terjadi. Evaluation memeriksa apakah perilaku itu benar dan tetap aman.
6. **Dari kelayakan teknis ke kelayakan bisnis.** Cost Runs mengubah pemakaian token menjadi biaya per skenario. Arsitektur VPS menunjukkan bentuk operasional yang dipakai tanpa membahas harga sewanya.

Demo sebaiknya muncul sebelum penjelasan teknis yang dalam karena audience campuran membutuhkan satu pengalaman bersama. Setelah melihat Customer bertanya, AI memakai sumber, dan manusia mengambil alih, istilah seperti orchestration, MCP, tracing, dan Evaluation memiliki konteks nyata. Tanpa demo, penjelasan teknis mudah terdengar seperti daftar komponen.

## C. Recommended narrative

### Alternatif 1 — Satu Ticket, dari awal sampai dipercaya

**Narrative**

Mulai dari satu Customer yang membutuhkan jawaban cepat dan benar. Tampilkan journey pada Workspace demo: pesan masuk melalui Channel, AI memakai Knowledge atau Shopify MCP/HTTP Tool, lalu Ticket diselesaikan atau diteruskan kepada Human Agent. Setelah audience melihat hasilnya, buka lapisan sistem yang membuat journey itu aman. Tutup dengan bukti operasi melalui Observability, Evaluation, dan Cost Runs.

**Kelebihan**

- Satu contoh menjaga audience teknikal dan bisnis tetap mengikuti cerita yang sama.
- Demo terasa sebagai bukti produk, bukan selingan.
- Human Handoff muncul sebagai bagian normal dari layanan, bukan kegagalan AI.
- Semua bagian teknis dapat dikaitkan kembali ke momen tertentu pada Ticket.

**Kekurangan**

- Satu journey tidak dapat memperlihatkan semua capability.
- Pemilihan skenario demo harus cukup kaya tetapi tetap stabil.

**Kemungkinan overload teknikal**

Sedang. Risiko muncul jika setiap langkah demo langsung diikuti detail module, queue, schema, dan provider. Batasi penjelasan pada batas tanggung jawab dan kontrol yang memengaruhi hasil.

**Kemungkinan kehilangan konteks bisnis**

Rendah. Customer, masalah, dan Resolution tetap menjadi benang merah.

### Alternatif 2 — Trust stack untuk AI customer support

**Narrative**

Mulai dari pertanyaan, “Apa yang harus benar sebelum perusahaan berani membiarkan AI berbicara dengan Customer?” Jawab dengan beberapa lapisan: sumber yang dapat dipercaya, akses Tool yang dibatasi, Human Handoff, Observability, Evaluation, dan Cost. Demo digunakan untuk membuktikan setiap lapisan.

**Kelebihan**

- Kuat untuk audience arsitektur dan engineering.
- Menjelaskan dengan jelas kenapa prompt saja tidak cukup.
- Observability dan Evaluation masuk secara alami sebagai mekanisme trust.

**Kekurangan**

- Produk dapat terasa seperti kumpulan guardrail.
- Nilai pengalaman Customer dan alur kerja Human Agent kurang dominan.

**Kemungkinan overload teknikal**

Tinggi. Banyak lapisan kontrol dapat berubah menjadi checklist teknis.

**Kemungkinan kehilangan konteks bisnis**

Sedang hingga tinggi jika setiap kontrol tidak dikaitkan dengan risiko bisnis yang dicegah.

### Alternatif 3 — Dari otomatisasi ke unit economics

**Narrative**

Mulai dari beban pertanyaan berulang. Tunjukkan bagaimana SupportOps mengotomatiskan pekerjaan awal, mempertahankan manusia untuk kasus sulit, lalu ukur hasilnya melalui Resolution, Evaluation, token, dan biaya model. Arsitektur dijelaskan sebagai cara menjalankan model operasi tersebut.

**Kelebihan**

- Mudah dipahami stakeholder bisnis.
- Cost Simulation memiliki posisi penting dan bukan lampiran teknis.
- Membuka pembicaraan tentang efisiensi tanpa mengklaim AI menggantikan manusia.

**Kekurangan**

- Dapat mendorong audience meminta angka ROI yang belum menjadi scope analisis.
- Keunikan teknis seperti pemisahan Channel, AI Agent, dan Ticket lifecycle lebih sulit terlihat.

**Kemungkinan overload teknikal**

Rendah.

**Kemungkinan kehilangan konteks bisnis**

Rendah, tetapi ada risiko konteks produk menyempit menjadi penghematan biaya.

### Rekomendasi

Gunakan **Alternatif 1 — Satu Ticket, dari awal sampai dipercaya**.

Narrative ini paling seimbang untuk audience campuran. Ia membuka dengan masalah bisnis, memberi bukti produk lebih awal, lalu memakai pertanyaan dari demo untuk masuk ke arsitektur dan AI. Observability, Evaluation, dan Cost tidak berdiri sebagai fitur tambahan. Ketiganya menjadi jawaban atas pertanyaan apakah journey tadi dapat dipercaya, diperbaiki, dan dijalankan secara masuk akal.

Alternatif 2 dapat menjadi bahasa pendukung saat menjelaskan kontrol AI. Alternatif 3 dapat dipakai untuk penutup, tetapi tidak cukup kuat sebagai struktur utama karena SupportOps belum seharusnya direduksi menjadi cerita penghematan biaya.

## D. Major presentation sections

1. **Problem — cepat saja tidak cukup.** Tim support membutuhkan jawaban cepat, tetapi Customer juga membutuhkan jawaban yang benar dan jalan menuju manusia.
2. **Product — satu lifecycle support.** SupportOps menyatukan Channel, AI Agent, Ticket, dan Human Agent tanpa mencampur tanggung jawabnya.
3. **Demo — satu Ticket nyata.** Gunakan Workspace yang sudah siap. Detail workflow, Channel pembuka, media, Tool, dan titik Human Handoff akan ditentukan pada tahap analisis demo.
4. **How the System Works — dari pesan ke Resolution.** Jelaskan Platform, API, Worker, PostgreSQL/pgvector, Redis, R2, Channel, dan sistem eksternal hanya sejauh menjelaskan journey demo.
5. **How the AI Works — sumber, keputusan, dan batas.** Jelaskan Agent Memory, Knowledge, HTTP/MCP Tool, keputusan answer/clarify/escalate/resolve, dan kontrol deterministik di aplikasi.
6. **How We Observe and Evaluate It — melihat kejadian dan menguji perilaku.** AI Activity menjawab kebutuhan operasi. Telemetry menjawab kebutuhan diagnosis. Evaluation menguji perilaku yang diharapkan, termasuk negative controls.
7. **How Much It Costs — dari token ke keputusan bisnis.** Gunakan Cost Runs untuk menunjukkan biaya model per skenario. Jelaskan VPS yang digunakan sebagai bentuk deployment, tanpa biaya VPS.
8. **Closing — AI dengan batas yang jelas.** Kembali ke thesis dan satu Ticket yang telah diikuti audience.

## E. Pertanyaan yang harus dijawab setiap section

### 1. Problem

- Masalah bisnis apa yang lebih besar daripada sekadar lambat membalas chat?
- Apa risikonya jika AI menjawab kebijakan atau data order tanpa sumber?
- Kenapa tujuan produk bukan menggantikan seluruh Human Agent?

### 2. Product

- Apa yang terjadi sejak Customer mengirim pesan sampai Ticket selesai?
- Apa bedanya SupportOps dengan chatbot yang hanya membungkus LLM?
- Di mana Human Agent masuk tanpa meminta Customer mengulang cerita?

### 3. Demo

- Bisakah AI memakai Knowledge yang published untuk kebijakan dan Tool untuk data bisnis langsung?
- Apakah AI Instructions benar-benar memengaruhi cara AI bekerja dalam Workspace tersebut?
- Apa yang terjadi ketika informasi tidak cukup, Tool gagal, atau keputusan manusia diperlukan?
- Bagaimana WhatsApp, termasuk chat atau media, dapat dipakai tanpa mengalihkan fokus dari lifecycle support?

Demo harus memakai konfigurasi yang sudah ada. Setup Knowledge, Tool, MCP, user, Evaluation, dan WhatsApp tidak perlu diperagakan satu per satu. Dokumen narrative ini hanya menetapkan fungsi demo dalam cerita. Workflow demo yang rinci dibahas pada tahap `04-demo-strategy`.

### 4. How the System Works

- Komponen mana menerima pesan, menjalankan aturan bisnis, dan mengerjakan proses background?
- Bagaimana Web Widget dan WhatsApp masuk ke lifecycle Ticket yang sama?
- Mengapa data utama dan pencarian Knowledge memakai PostgreSQL, sedangkan file berada di R2?
- Apa yang berjalan pada Tencent Cloud VPS dan apa yang tetap menjadi layanan eksternal?

### 5. How the AI Works

- Informasi apa yang boleh dipakai AI untuk menjawab Customer?
- Kapan AI memakai Knowledge, HTTP Tool, atau MCP Tool?
- Kontrol apa yang ditegakkan aplikasi, bukan sekadar ditulis dalam prompt?
- Bagaimana sistem memastikan AI berhenti setelah Human Agent mengambil alih?

Inilah technical differentiator utama: AI berada di dalam workflow yang memiliki sumber data, izin, status, dan jalur keluar menuju manusia. LLM adalah salah satu komponen, bukan keseluruhan produk.

### 6. How We Observe and Evaluate It

- Apa yang dilakukan AI pada satu Ticket dan dapat dilihat oleh tim operasi?
- Di langkah mana waktu, token, atau Tool call bermasalah?
- Perilaku apa yang diuji sebelum hasil AI dipercaya?
- Bagaimana negative controls mencegah evaluator yang rusak memberi kesan semua kasus lulus?

Observability menjelaskan kejadian nyata setelah atau saat sistem berjalan. Evaluation menjalankan kasus tetap untuk menilai apakah perilaku AI sesuai harapan. Keduanya membangun trust dari arah yang berbeda dan saling melengkapi.

### 7. How Much It Costs

- Berapa token dan biaya model pada skenario yang ringan, memakai Knowledge, memakai Tool, atau membutuhkan langkah lebih panjang?
- Bagian arsitektur mana yang paling memengaruhi biaya per AI Turn?
- Bagaimana Cost Runs membantu memilih model, instructions, dan jumlah Tool call secara sadar?
- Infrastruktur apa yang dijalankan pada VPS saat ini?

Cost Simulation menghubungkan arsitektur dengan business viability karena desain prompt, retrieval, memory, model, dan Tool call terlihat sebagai biaya per journey. Presentasi tidak perlu memasukkan harga VPS atau mengubah Cost Runs menjadi proyeksi ROI yang belum didukung data.

### 8. Closing

- Apa satu hal yang membedakan SupportOps dari chatbot LLM?
- Kenapa perusahaan dapat memberi AI peran nyata tanpa menyerahkan seluruh kontrol kepadanya?

## F. Perkiraan pembagian waktu

Target utama: **18 menit**, dengan ruang sekitar 2 menit untuk variasi demo atau transisi.

| Bagian | Waktu |
| --- | ---: |
| Problem | 1,5 menit |
| Product | 1,5 menit |
| Demo | 4 menit |
| How the System Works | 2,5 menit |
| How the AI Works | 3 menit |
| Observability dan Evaluation | 2,5 menit |
| Cost dan deployment VPS | 1,5 menit |
| Closing | 1,5 menit |
| **Total** | **18 menit** |

Jika demo berjalan lebih lama, potong detail komponen infrastruktur. Jangan memotong Human Handoff, Observability, atau Evaluation karena ketiganya membawa pesan trust.

## G. Transisi antarbagian

**Problem → Product**  
“Jadi masalahnya bukan hanya membalas lebih cepat. Kita perlu sistem yang tahu kapan AI boleh menjawab dan kapan manusia harus mengambil alih.”

**Product → Demo**  
“Sebelum melihat bagian teknisnya, mari lihat dulu seperti apa pengalaman itu dalam satu Ticket nyata.”

**Demo → How the System Works**  
“Tadi terlihat seperti satu percakapan sederhana. Di belakangnya, beberapa komponen menjaga pesan, pekerjaan background, dan data bisnis tetap berada pada jalur yang benar.”

**How the System Works → How the AI Works**  
“Arsitektur membawa pesan ke tempat yang tepat. Pertanyaan berikutnya adalah bagaimana AI memilih sumber dan memutuskan langkah berikutnya.”

**How the AI Works → Observability**  
“Aturan yang baik belum cukup jika kita tidak dapat melihat apa yang benar-benar terjadi saat AI berjalan.”

**Observability → Evaluation**  
“Observability membantu kita memahami satu kejadian nyata. Evaluation menjawab apakah perilaku yang sama tetap benar pada kumpulan skenario yang sengaja disiapkan.”

**Evaluation → Cost**  
“Setelah tahu sistem dapat diperiksa dan diuji, pertanyaan bisnis berikutnya adalah berapa biaya untuk menjalankan pola kerja ini.”

**Cost → Closing**  
“Dengan begitu, kita tidak hanya punya AI yang bisa menjawab. Kita punya workflow yang dapat dibatasi, diperiksa, diuji, dan diukur.”

## H. Informasi yang sengaja tidak perlu dibahas

- Detail setiap route, schema, queue, class, atau function.
- Setup Workspace dari nol. Workspace demo sudah dikonfigurasi.
- Daftar seluruh Knowledge Source, Tool, Eval Case, user, dan AI Instruction.
- Detail internal WhatsApp Message Template. Tidak ada kebutuhan pengelolaan template dalam produk atau demo ini.
- Harga atau biaya sewa VPS. Cukup jelaskan VPS yang digunakan dan komponen yang berjalan di sana.
- Proyeksi ROI, penghematan headcount, atau kapasitas skala yang belum didukung pengukuran.
- Harga Shopify atau layanan eksternal jika tidak muncul sebagai biaya nyata dalam Cost Runs.
- Detail prompt lengkap atau private reasoning model. Yang relevan adalah input, Tool/Knowledge yang digunakan, keputusan, dan hasil yang tercatat.
- Semua edge case Channel, Attachment, retry, timeout, dan timer Ticket.
- Klaim bahwa Evaluation berjalan otomatis di CI. Evaluation saat ini dijalankan manual terhadap Workspace yang dipilih.
- Klaim bahwa satu hasil demo atau satu Cost Run membuktikan kualitas dan biaya untuk seluruh beban production.

## Status evidence dan ketidakpastian lanjutan

- Lifecycle Ticket, Knowledge, HTTP/MCP Tool, Human Handoff, AI Activity, Telemetry, dan manual Evaluation berstatus **IMPLEMENTED** berdasarkan implementation yang dirujuk baseline.
- Workspace serta Business System yang dipakai untuk demo berstatus **DEMO / DEVELOPMENT INFRASTRUCTURE**. Kesiapan konfigurasinya dikonfirmasi project owner.
- WhatsApp siap digunakan pada environment local dan production untuk chat, gambar, file, serta penanganan oleh Human Agent berdasarkan konfirmasi project owner.
- Penambahan Channel lain tetap **ARCHITECTURAL INTENT** dan tidak perlu masuk ke narrative utama.
- Hasil Evaluation, trace, serta Cost Run yang akan ditampilkan belum dipilih. Tahap analisis berikutnya perlu memilih bukti yang representatif tanpa mengubahnya menjadi klaim umum.

## Kandidat visual untuk tahap berikutnya

- Satu garis perjalanan: Customer → AI Agent → Knowledge/Tool → Resolution atau Human Handoff.
- Satu diagram batas sistem yang memisahkan Channel, SupportOps pada VPS, dan layanan eksternal.
- Satu hubungan trust: AI Activity/Telemetry untuk melihat, Evaluation untuk menguji, Cost Runs untuk mengukur.

Visual tersebut baru kandidat. Dokumen ini belum menentukan detail slide final.
