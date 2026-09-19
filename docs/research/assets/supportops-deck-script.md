# Naskah Presentasi SupportOps

Target penyampaian: sekitar 12–15 menit di luar demo. Naskah mencakup seluruh kelompok informasi penting pada slide tanpa membacakan setiap label secara terpisah.

## 1. Pembuka — ±40 detik

“SupportOps adalah platform customer support multi-channel yang menempatkan AI Agent sebagai penangan pertama. Customer dapat menghubungi melalui Web Widget atau WhatsApp. AI menjawab menggunakan knowledge perusahaan dan data bisnis melalui RAG, HTTP Tool, atau MCP Tool. Ketika jawaban tidak memiliki dasar yang aman, AI berhenti dan menyerahkan Ticket kepada Human Agent. Pada presentasi ini saya akan membahas masalah, ruang lingkup MVP, arsitektur, evaluasi, biaya, dan demo alur lengkapnya.”

Transisi: “Kita mulai dari kondisi customer support sebelum menggunakan SupportOps.”

## 2. Masalah — ±70 detik

“Pada tim support skala menengah, interaksi Customer sering tersebar di tiga tempat. Live chat dijawab oleh staf yang kebetulan melihat, WhatsApp dipegang melalui ponsel pribadi, sedangkan email menjadi thread yang tidak pernah benar-benar ditutup. Ketiganya memiliki aplikasi, akun, dan riwayat sendiri, tanpa antrean, konteks, atau knowledge base bersama.

Dampaknya terlihat pada enam area: response time melambat karena penanggung jawab tidak jelas; konteks satu Customer terpecah; jawaban yang sama dikerjakan berulang; kebijakan sulit ditemukan; pertanyaan serupa terus masuk; dan saat terjadi handoff, Agent berikutnya harus membaca ulang percakapan.

Secara operasional, satu tim harus menjaga tiga aplikasi sementara pertanyaan dapat masuk 24 jam. Sebagai pembanding, biaya satu Customer Service di Indonesia berada pada kisaran 3,75 sampai 5,48 juta rupiah per bulan. Jadi masalahnya bukan hanya biaya orang, tetapi cara kerja yang terfragmentasi.”

Transisi: “Karena itu, menambah satu alat atau satu staf saja belum tentu menyelesaikan akar masalah.”

## 3. Kenapa Sulit — ±80 detik

“Solusi yang dibutuhkan harus memenuhi empat syarat sekaligus: menjawab dari knowledge perusahaan, mengambil data bisnis terbaru, tetap bekerja saat Channel baru ditambah, dan memiliki biaya yang terkendali.

Menambah Human Agent memenuhi kebutuhan knowledge dan data, tetapi setiap Channel baru tetap menambah inbox serta biaya operasional. Produk AI siap pakai dapat memakai help center dan mendukung beberapa Channel, tetapi integrasi data bergantung pada produk dan paket; contoh harga Intercom Fin dimulai dari sekitar 0,99 dolar per outcome di luar biaya seat. AI yang dibuat khusus di Web Widget dapat lebih murah, tetapi knowledge dan integrasinya harus dibangun sendiri, serta logika AI menjadi melekat pada Channel web.

SupportOps memisahkan logika AI dari Channel melalui Channel Adapter. Jawaban faktual harus grounded pada Knowledge Source yang Customer-Safe atau data Tool, seluruh akses dibatasi per Workspace, dan pengukuran internal menunjukkan Session tipikal sekitar 110 sampai 124 rupiah. Angka itu adalah biaya model per Session, bukan biaya total produk.”

Transisi: “Dengan empat kebutuhan tersebut, MVP difokuskan pada alur support end-to-end.”

## 4. Scope MVP — ±80 detik

“Bagian yang sudah berjalan dibagi menjadi empat kelompok. Pertama, Channel dan percakapan: Web Widget dan WhatsApp, termasuk Pre-Chat serta Session Link khusus web dan balasan streaming melalui SSE. Kedua, kapabilitas AI Agent: RAG atas knowledge, riwayat Ticket, attachment, serta HTTP dan MCP Tool yang dapat membaca maupun mengubah data sesuai tingkat risikonya. Ketiga, sisi Human Agent: Escalation, Shared Human Queue, Claim, Admin Takeover, dan AI Copilot. Keempat, operasional: Follow-Up, Auto-Resolution, Activity Timeline, dan dashboard analitik.

MVP belum mencakup Email sebagai Channel, Supervisor, SLA engine, auto-routing, versioning dan recrawl knowledge terjadwal, penggabungan identitas lintas Channel, SSO, user multi-Workspace, fallback provider, multi-model per Workspace, Ticket reopen, serta pencarian percakapan. Item tersebut sengaja ditunda agar MVP lebih dulu membuktikan alur inti dari pesan pertama sampai Resolution atau Escalation.”

Transisi: “Sekarang saya tunjukkan bagaimana ruang lingkup tersebut dibagi di tingkat sistem.”

## 5. Arsitektur Sistem — ±120 detik

“Arsitektur sistem dibagi menjadi lima bagian. Experience Layer terdiri dari Web Widget pada website Workspace, WhatsApp melalui Meta Cloud API, dan Platform UI berbasis React untuk inbox, knowledge, dan analitik. Customer masuk melalui dua Channel, sedangkan Human Agent dan Admin bekerja melalui Platform UI.

Di Application Core, API Server menangani autentikasi, akses data, dan produksi queue. Domain Session dan Ticket menjalankan Channel Adapter, retrieval, serta Tool runtime, sekaligus menentukan apakah AI perlu berjalan. AI Agent Runtime menghasilkan jawaban grounded, memakai Tool, atau melakukan Escalation tanpa mengetahui cara pesan dikirim. Worker menjalankan pekerjaan latar belakang seperti ingestion, attachment, reasoning WhatsApp, Follow-Up, Auto-Resolution, dan Idle Closure. Semua data dibatasi per Workspace dan balasan web dialirkan melalui SSE.

Sistem eksternal mencakup gateway untuk completion dan embedding, MCP serta HTTP Tool untuk data bisnis real-time, lalu layanan OCR, crawling, dan email. Untuk penyimpanan, PostgreSQL dan pgvector menampung data serta vektor knowledge, Redis menjalankan queue dan delayed job, sedangkan object storage menyimpan attachment dan file knowledge. AI Activity menyimpan langkah yang relevan bagi pengguna, sementara OTLP trace dan log dipakai untuk observability teknis.

Alur pengirimannya juga otomatis: perubahan masuk melalui pull request, diperiksa GitHub Actions dengan lint, typecheck, test, build, dan migrasi; aplikasi yang berubah dibangun sebagai image Docker di GHCR dan diberi tag commit; deploy dijalankan melalui SSH ke VPS dengan Docker Compose, Caddy, HTTPS otomatis, dan rollback berdasarkan SHA.

Perbedaan alur Channel terlihat di bagian bawah. Web menerima jawaban langsung melalui SSE. WhatsApp masuk melalui webhook, queue, dan Worker sebelum dikirim kembali lewat Meta. Platform UI mengakses layanan Workspace melalui API. Pada contoh Workspace Northstar Outfitters, Web Widget dan WhatsApp aktif, terdapat 13 MCP Tool yang ditemukan dan ditetapkan, serta delapan Knowledge Source yang lima di antaranya Customer-Safe.”

Transisi: “Dari arsitektur sistem ini, kita masuk lebih dalam ke cara AI mengambil keputusan.”

## 6. Arsitektur AI Agent — ±150 detik

“Pesan dari Web Widget maupun WhatsApp lebih dulu dinormalisasi, diautentikasi, dan diarahkan oleh Channel Adapter. Session dan Agent Memory sudah ada sejak percakapan dimulai, bahkan sebelum Ticket dibuat. Sistem kemudian mengklasifikasikan judul, kategori, dan prioritas, sedangkan Ticket Eligibility Gate menentukan apakah percakapan sudah menjadi kebutuhan support.

Saat AI Agent berjalan, ada enam langkah. Sistem memuat Ticket, Agent Memory, dan jumlah klarifikasi; server membentuk daftar Tool yang memang ditetapkan untuk AI Agent; Tool loop dibatasi oleh anggaran pemanggilan dan timeout 60 detik; jawaban hanya dibentuk dari knowledge, riwayat, attachment, dan hasil Tool; AI memilih REPLY, CLARIFY, ESCALATE, atau RESOLVE dengan maksimal dua klarifikasi; lalu Message, penggunaan Tool, status, delivery, dan AI Activity disimpan.

Grounding berasal dari Knowledge Source Customer-Safe, Ticket history milik Customer yang sama, hasil OCR atau transkripsi attachment, serta data dan aksi bisnis dari MCP atau HTTP Tool. Hanya Tool yang ditetapkan pada Workspace itu yang terlihat oleh AI. Tool read-only dapat dipakai ketika relevan. Tool mutating, seperti update cart, hanya berjalan bila Customer secara eksplisit meminta aksi tersebut; aksi irreversible memerlukan usulan AI dan konfirmasi Customer pada pesan berikutnya. Hasil Tool tetap dianggap data tidak tepercaya, dan kegagalan Business Tool langsung menghasilkan Escalation, bukan tebakan.

Model dipisahkan berdasarkan pekerjaan: Fast Model untuk klasifikasi, Main Model untuk reasoning, jawaban, dan Tool, serta Embedding Model untuk retrieval. Semuanya diakses melalui Completion Gateway dan ID model dapat dikonfigurasi melalui environment.

Jika AI tidak dapat melanjutkan, Ticket masuk ke Shared Human Queue. Human Agent melakukan Claim, menerima Escalation Summary yang dibuat saat Claim agar konteksnya terbaru, dan dapat meminta Suggested Reply dari AI Copilot. Admin juga dapat melakukan Takeover. Setelah Escalation atau Takeover, AI tidak lagi menjawab Customer.

Follow-Up, Auto-Resolution, dan Idle Closure berjalan sebagai delayed job di Worker, bukan pada request utama. AI Activity mencatat tindakan yang dapat dijelaskan, sedangkan OTLP trace mencatat telemetry teknis. Escalation memiliki alasan tetap, misalnya knowledge tidak cukup, Customer meminta manusia, tindakan internal diperlukan, sumber bertentangan, Tool gagal, atau AI timeout. Guardrail utamanya: knowledge Internal-Only tidak pernah dikirim ke Customer, setiap query dibatasi per Workspace, sumber yang bertentangan menyebabkan Escalation, dan RESOLVE membutuhkan konfirmasi eksplisit dari Customer.”

Transisi: “Seluruh aturan tersebut kemudian diuji melalui evaluasi yang dapat diulang.”

## 7. Evaluasi — ±120 detik

“Evaluasi memakai 78 Eval Case dan 11 metrik. Kasusnya mencakup 22 pertanyaan kebijakan dan fakta umum, 11 edge case, masing-masing sembilan kasus Tool dan Escalation, enam konflik atau staleness, lima kasus ketika AI harus menolak menebak, serta kasus visibility, guardrail, bahasa, dan attachment. Ada negative control yang sengaja harus gagal agar evaluator tidak sekadar meluluskan semuanya.

Prosesnya terdiri dari empat tahap. Pertama, menyiapkan test set dan Gold Chunk untuk retrieval. Kedua, menjalankan Agent produksi tanpa modifikasi pada Workspace dan Knowledge Source yang nyata, tetapi menahan Tool yang tidak dapat dibatalkan. Ketiga, menilai fakta, keputusan, pemilihan Tool, kebocoran data, dan makna jawaban dengan kombinasi pemeriksaan pasti serta LLM judge. Keempat, hasil menjadi pemeriksaan sebelum rilis, termasuk target recall minimal 0,90, latency, token, dan biaya. Saat ini pemeriksaan tersebut masih dijalankan manual, belum menjadi CI gate otomatis.

Model utama yang diuji adalah gpt-5.6-luna; klasifikasi memakai deepseek-v4-flash; retrieval memakai text-embedding-3-small; dan Gemini digunakan hanya sebagai judge. Perbaikan dilakukan dari baseline B0 sampai B3, satu perubahan lalu seluruh suite dijalankan kembali. Prompt atau retrieval yang diperbaiki, bukan test-nya, dan optimasi biaya hanya diterima bila kualitas tetap terjaga. Salah satu hasilnya adalah Tool manifest berkurang 76 persen.

Pada B3, kualitas jawaban, keputusan, penggunaan Tool, faithfulness, retrieval, fakta pasti, visibility, bahasa, dan relevancy mencapai target 100 persen pada set ini. Negative control tetap gagal sesuai rancangan. Hasil per Case dapat diperiksa di Anvia Lens bersama input, jawaban, token, dan latency.”

Transisi: “Setelah kualitas terukur, pertanyaan berikutnya adalah biaya menjalankannya.”

## 8. Biaya — ±110 detik

“Biaya dihitung dari median tiga pengukuran Session nyata pada 17 September, dengan kurs 17.700 rupiah per dolar. Pada volume 10 ribu Session per bulan, skenario ringan sekitar 698 ribu rupiah atau 70 rupiah per Session. Skenario menengah yang menjadi dasar perencanaan sekitar 1,13 juta rupiah atau 113 rupiah per Session. Skenario berat, dengan lebih banyak transaksi dan percakapan panjang, sekitar 1,58 juta rupiah atau 158 rupiah per Session.

Biaya satu Session bervariasi menurut pekerjaan: small talk hampir nol, satu FAQ sekitar 0,0014 dolar, Escalation sekitar 0,0027 dolar, sedangkan lookup order, beberapa FAQ, pembelian, attachment, dan percakapan 15 turn berada sekitar 0,009 sampai 0,015 dolar. Main Model menyumbang kurang lebih 90 persen tagihan. Sebanyak 77 sampai 96 persen input-nya dapat memakai cache yang sepuluh kali lebih murah per token, sedangkan OCR hanya muncul jika ada attachment.

Biaya bertambah hampir linear terhadap volume: pada skenario menengah sekitar 7 dolar untuk seribu Session, 64 dolar untuk sepuluh ribu, dan 634 dolar untuk seratus ribu. Dibandingkan secara kasar, biaya model SupportOps sekitar 113 rupiah per Session, sedangkan harga ritel solusi lain berada di puluhan ribu rupiah. Perbandingan ini harus dibaca dengan hati-hati karena SupportOps menampilkan biaya mentah model, bukan harga jual. Setelah server, database, dan storage sekitar 20 sampai 40 dolar per bulan ditambahkan, total untuk sepuluh ribu Session masih diproyeksikan di bawah 100 dolar.”

Transisi: “Berikutnya saya tunjukkan apakah alur yang baru dijelaskan benar-benar terasa sebagai satu pengalaman.”

## 9. Demo — pembuka ±30 detik

“Pada demo ini saya akan menunjukkan satu percakapan dari awal sampai selesai. Customer mengirim pertanyaan melalui Channel, AI mengambil knowledge atau data bisnis, lalu memilih menjawab, menyelesaikan Ticket, atau melakukan Escalation. Perhatikan tiga hal: sumber yang mendasari jawaban, perubahan status Ticket, dan konteks yang diterima Human Agent ketika mengambil alih.”

Setelah demo: “Demo ini menunjukkan bahwa percakapan tetap berada pada satu Session dan satu alur, meskipun penanganannya berpindah dari AI Agent ke Human Agent.”

## 10. Roadmap — ±110 detik

“Roadmap ini adalah estimasi enam minggu setelah MVP. Implementasinya dipercepat dengan AI-assisted development, tetapi setiap tahap tetap memiliki hasil yang harus diverifikasi. Pada minggu pertama, fokusnya adalah hardening. Customer Identity diteruskan ke Tool agar lookup memakai akun Customer yang benar. Eval dijadikan CI gate, dashboard menampilkan token dan biaya per AI Turn, Session, serta Workspace, retry pengiriman dibuat tahan lintas proses, dan discovery MCP serta recrawl knowledge dijalankan terjadwal.

Pada minggu kedua sampai ketiga, sistem diuji melalui pilot pada satu Workspace menggunakan Web Widget dan WhatsApp. Real case-nya mencakup FAQ dan kebijakan, kondisi ketika knowledge tidak tersedia, lookup order, invoice, produk, serta inventory, aksi update cart, dan Escalation ke Human Agent. Update cart harus membuktikan bahwa aksi hanya berjalan setelah permintaan atau konfirmasi Customer yang sesuai. Hasil pilot diukur dari Resolution, ketepatan Escalation, latency, error rate, dan biaya per Session, sambil memeriksa tidak ada kebocoran antar-Workspace maupun knowledge Internal-Only.

Pada minggu keempat sampai keenam, hasil pilot menjadi dasar scale-up. Email ditambahkan sebagai Channel ketiga, cross-channel identity menghubungkan Customer yang sama, dan kebutuhan tim besar ditangani melalui Supervisor, SLA, serta auto-routing. Knowledge versioning menyediakan rollback publikasi, sementara fallback AI provider dan pemilihan model per Workspace meningkatkan ketahanan platform. Urutan tahap ini dapat berubah jika hasil pilot menunjukkan risiko yang lebih mendesak.”

Transisi: “Urutan ini menjaga pengembangan tetap didorong oleh risiko nyata, bukan sekadar jumlah fitur.”

## 11. Penutup — ±30 detik

“SupportOps menyatukan Channel, AI Agent, knowledge, data bisnis, dan Human Agent dalam satu alur customer support. AI bekerja selama memiliki sumber yang aman dan Tool yang diizinkan. Ketika tidak yakin atau membutuhkan tindakan manusia, sistem melakukan Escalation dengan konteks yang tercatat. MVP sudah berjalan, perilaku AI sudah dievaluasi, dan biaya utamanya sudah diukur. Terima kasih, saya siap menerima pertanyaan.”
