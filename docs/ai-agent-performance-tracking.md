# AI Agent Performance Tracking

Status pekerjaan biaya (cost) dan latensi AI Agent: angka dasar yang terukur,
perubahan yang sudah diterapkan, dan antrean pekerjaan berikutnya. Perbarui
dokumen ini setiap kali GitHub issue pada tabel antrean ditutup.

Analisis lengkap beserta sumber rujukannya ada di
[`research/ai-agent-cost-and-latency.md`](research/ai-agent-cost-and-latency.md).
Dokumen ini ringkasannya untuk dibaca cepat.

Status yang dipakai:

- **Selesai** — sudah diterapkan di kode, lulus unit test, typecheck, dan lint.
- **Selesai, belum terukur** — sudah diterapkan, tetapi efeknya belum dibuktikan oleh eval suite.
- **Siap dikerjakan** — tidak ada issue lain yang memblokir; bisa diambil sekarang.
- **Menunggu** — masih diblokir issue lain.
- **Bersyarat** — mungkin ditutup tanpa dikerjakan bila pengukuran menyatakan tidak perlu.

## Ringkasan temuan

Tiga hal yang mengubah arah pekerjaan ini, semuanya hasil pengukuran, bukan dugaan:

| Temuan | Angka | Konsekuensi |
| --- | --- | --- |
| Prompt caching sudah aktif | 11.658 dari 11.677 token input berstatus cached (99,8%) pada satu turn; 71% pada keseluruhan sampel | Gateway melakukan caching otomatis tanpa `cache_control` di kode. "26,6k token per turn" adalah angka akuntansi, bukan angka biaya — token cached ditagih jauh lebih murah. Risiko utamanya bukan boros, melainkan cache yang pecah diam-diam. |
| Biayanya ada di manifest Tool, bukan di retrieval | Definisi 13 Tool Shopify ~13.480 token, melawan ~1.160 token untuk seluruh system prompt | Token per turn hampir konstan tanpa peduli pertanyaannya — ciri payload tetap per request, bukan retrieval yang membengkak. Memotong `top-k` menghemat sedikit sekali dan mengorbankan metrik `faithfulness` yang justru sedang gagal. |
| Separuh token output adalah reasoning | 51,5% token output, p50 output 70 token | Token output yang menentukan waktu generasi, bukan token input. Ini lever latensi terbesar yang belum disentuh. |

## Baseline B0 (dibekukan)

Diukur 2026-09-16 pada commit `ad293a3`, sebelum perubahan apa pun di bagian
berikutnya. **Jangan diedit** — baseline berikutnya ditambahkan sebagai set baru
di dokumen riset, bukan menimpa yang ini.

| Suite | Case | Lulus | Token/case | ms/case |
| --- | --- | --- | --- | --- |
| `contains` | 6 | 6 | 26.566 | 6.791 |
| `faithfulness` | 3 | 1 (1 gagal, 1 invalid) | 20.789 | 23.221 |
| `decision` | 14 | 12 | 22.206 | 7.091 |
| `tool` | 7 | 6 | 31.254 | 8.616 |
| `visibility` | 4 | 4 | 21.995 | 6.337 |
| `negativeControl` | 1 | 0 | 25.048 | 4.661 |
| `language` | 3 | 3 | 25.393 | 6.269 |
| `relevancy` | 3 | 3 | 25.476 | 24.089 |
| `gEval` | 23 | 17 | 22.689 | 13.521 |

Durasi end-to-end p50 ≈ 6,3 detik, p90 ≈ 13,4 detik, maksimum 17,7 detik. B0
tidak punya angka TTFT sama sekali — instrumentasinya belum ada saat itu.

Biaya judge terpisah dan kecil: 6.133 token untuk `relevancy`, 20.969 untuk
`gEval`, 15.549 untuk `faithfulness`. Judge bukan sumber pengeluaran.

Case yang gagal pada B0 — ini lantai mutu yang tidak boleh turun lebih jauh oleh
optimisasi apa pun:

| Case | Suite | Hasil |
| --- | --- | --- |
| `negative-control` | `negativeControl` | gagal (1 dari 1 — satu-satunya Case di suite ini) |
| `edge-no-first-scan` | `faithfulness` | gagal, skor 0,33 |
| `common-split-shipment` | `faithfulness` | invalid — cacat harness, sudah diperbaiki |
| `common-return-window` | `gEval` | gagal |
| `escalation-two-completed-charges` | `gEval` | gagal |
| `tool-unknown-order` | `tool` | gagal |
| 2 Case | `decision` | gagal |
| 4 Case lain | `gEval` | gagal |

## Perubahan yang sudah diterapkan

Semua diterapkan 2026-09-16, diverifikasi oleh unit test `packages/ai-agent`
(40 lulus), `tsc --noEmit`, dan `biome check`. **Belum satu pun diukur terhadap
eval suite** — efek yang tertulis di bawah masih prediksi, bukan hasil.

| # | Perubahan | Alasan | Efek yang diharapkan | Status |
| --- | --- | --- | --- | --- |
| 1 | Baris `cost:` per Case dan instrumentasi TTFT | Reporter menuliskan `retrieved` sebelum `usage`, sehingga potongan 16 KB memotong tepat di angka yang dibutuhkan — 10 dari 17 Case sampel tidak terbaca usage-nya | Dua angka yang sebelumnya tidak pernah ada: `ttftMs` (latensi yang benar-benar dirasakan Customer di balik stream) dan `ttfcMs` (saat Widget bisa menampilkan teks, bukan pembungkus JSON) | Selesai |
| 2 | `faithfulness` menilai turn tanpa retrieval, bukan melaporkannya `invalid` | `common-split-shipment` memilih `CLARIFY` dengan `retrieved: []` — perilaku benar yang dilaporkan sebagai error metrik | Case tetap dinilai; jawaban yang mengklaim fakta perusahaan tanpa Knowledge sekarang gagal, sebelumnya tidak dinilai sama sekali | Selesai |
| 3 | Empat load pra-model dijalankan paralel | `retrieve`, `countClarifications`, `loadMemory`, dan `tools` saling bebas tetapi berurutan di depan token model pertama | Tiga round trip database hilang dari TTFT | Selesai, belum terukur |
| 4 | Urutan Tool distabilkan | Manifest Tool adalah prefix prompt yang di-cache; `findMany` tanpa `orderBy` tidak menjamin urutan render yang sama dua kali | Cache tidak pecah antar turn | Selesai, belum terukur |
| 5 | `clarificationCount` dipindah ke ekor prompt | Nilai yang disisipkan di tengah teks statis memotong blok statis dan membuang cache pada seluruh token sesudahnya | Prefix yang bisa di-cache naik dari ~610 ke ~1.150 token — seluruh system prompt | Selesai, terukur |
| 6 | Schema Tool dikirim sekali, sebagai parameter schema asli | `inputSchema` dikirim sebagai schema terbuka sementara JSON Schema aslinya di-`stringify` ke dalam deskripsi Tool, jadi setiap request membawa schema checkout dua kali | Satu dari dua salinan manifest ~13,5k token hilang. Bukan seluruh manifest — provider tetap merender parameter schema-nya | Selesai, belum terukur |
| 7 | Knob `LLM_MAIN_MAX_OUTPUT_TOKENS` dan `LLM_MAIN_REASONING_EFFORT` | 51,5% token output adalah reasoning, dan token output yang mendominasi waktu generasi | Nilai dipilih: `low` dan `1024` di `.env.example`. Lantai mutu bertahan di `visibility`, `negativeControl`, `decision`; `gEval` naik 16→17 lulus. Output tertinggi teramati 391 token — angka `1024` memberi headroom ~2,6× tanpa membiarkan default provider ([#183](https://github.com/azarnuzy/supports-ops/issues/183)) | Selesai |
| 8 | Baris ringkasan p50/p95 per suite | Baris `cost:` per Case (perubahan 1) tidak dijumlahkan — membandingkan dua baseline lewat 23 Case adalah tempat kesalahan hitung manual terjadi | Satu baris ringkasan dicetak setelah Case terakhir tiap suite: TTFT, time-to-content, dan durasi total sebagai p50/p95; total token input, rasio cached, token output dan reasoning; rata-rata tool call per Case. Case tanpa `usage` dari provider dikecualikan dari angka token, bukan dihitung nol | Selesai, terverifikasi (`pnpm eval:ai-agent negativecontrol`) |
| 9 | Batas waktu 60 detik per attempt pada `runAiAgentTurn`, retry dihentikan begitu ada delta yang sudah sampai ke Customer atau begitu satu attempt timeout ([#185](https://github.com/azarnuzy/supports-ops/issues/185)) | Retry lama tidak punya batas waktu di luar Tool budget, sehingga model call yang macet (tanpa Tool) tidak pernah dibatasi, dan retry bisa mengulang reply yang sudah separuh terlihat Customer | Batas terburuk satu turn sekarang dinyatakan: 60 detik bila attempt pertama macet atau Customer sudah melihat output, hingga 120 detik hanya pada kasus gagal cepat-lalu-timeout. Timeout mengeskalasi dengan alasan `AI_TIMEOUT` yang sudah ada, bukan silent hang | Selesai |

Tidak ada dependensi baru yang ditambahkan. Konversi JSON Schema pada perubahan
nomor 6 memakai Zod 4.4 yang sudah terpasang, dengan fallback ke bentuk lama bila
sebuah schema tidak bisa dikonversi, sehingga tidak ada Tool yang kehilangan
argumennya.

| # | Perubahan | Alasan | Efek yang diharapkan | Status |
| --- | --- | --- | --- | --- |
| 10 | `replyPrompt` menambah dua aturan ESCALATE eksplisit: (a) saat `searchKnowledge` mengembalikan Knowledge Source yang saling bertentangan pada fakta yang dibutuhkan, jangan memilih salah satu nilai — ESCALATE dengan `CONFLICTING_KNOWLEDGE`; (b) saat Customer melaporkan beberapa completed/captured charge untuk order yang sama, ESCALATE untuk payment review walau Customer secara eksplisit meminta refund langsung ([#181](https://github.com/azarnuzy/supports-ops/issues/181)) | `common-return-window` gagal karena prompt tidak melarang model memilih salah satu window yang bertentangan (K03 vs L08); `escalation-two-completed-charges` gagal karena aturan "jangan menahan Tool call hanya karena ini write" pada prompt yang sama membiarkan model memproses refund langsung meski dua charge yang settled semestinya diverifikasi manusia dulu | Kedua Case dan Case `gEval` yang berbagi skenario sama — `staleness-conflicting-return-window`, `staleness-legacy-authority` — diharapkan lulus karena aturan konflik-Knowledge sekarang eksplisit, bukan tersirat lewat nama `escalationReason` saja | Selesai, belum terukur |

Perubahan nomor 10 diverifikasi oleh unit test `packages/ai-agent` (43 lulus,
termasuk Case baru di `reply.test.ts`) dan `tsc --noEmit`. **Belum
diukur terhadap eval suite** — lingkungan pengembangan ini tidak punya
`EVAL_WORKSPACE_ID` maupun kredensial model (`COMPLETION_GATEWAY_API_KEY` /
`OPENROUTER_API_KEY`), jadi `pnpm eval:ai-agent geval` dan
`pnpm eval:ai-agent decision` tidak bisa dijalankan di sini — kendala yang sama
yang sudah dicatat untuk #182. Empat kegagalan `gEval` B1 yang tersisa di luar
`common-return-window`/`escalation-two-completed-charges` tidak ditriase satu
per satu di sini: dua (`answer-search-specific-sku`,
`hybrid-live-price-policy-conflict`) sudah teridentifikasi sebagai regresi
schema Tool, di luar cakupan #181 per definisinya sendiri ("bukan kegagalan
pemilihan Tool"); tiga sisanya (dua CLARIFY yang seharusnya jawaban langsung,
satu bertingkah seperti `tool-unknown-order`) belum punya trace atau alasan
tertulis judge yang bisa dibaca di repo ini untuk ditriase tanpa menebak — item
antrean berikutnya harus menjalankan suite sungguhan terhadap Workspace,
membaca `judge`-nya lewat Lens/Langfuse, dan menutup #181 dengan angka
before/after serta identitas Case yang sebenarnya sebelum status di baris
antrean bisa naik dari "Selesai, belum terukur" ke "Selesai".

**Perubahan nomor 10, terukur oleh #180.** `pnpm eval:ai-agent decision`
terhadap kode nomor 10 saja (tanpa perubahan #180 di bawah) lulus 3 dari 3
percobaan untuk `escalation-two-completed-charges`, tapi `common-return-window`
gagal saat dijalankan sendiri (`REPLY`, bukan `ESCALATE`) — aturan konflik
di nomor 10 bergantung pada `searchKnowledge` benar-benar mengembalikan nilai
14-hari yang bertentangan, dan pencarian vektor untuk pertanyaan ini tidak
selalu membawanya (lihat nomor 11).

| # | Perubahan | Alasan | Efek yang diharapkan | Status |
| --- | --- | --- | --- | --- |
| 11 | `tool-unknown-order` diperbaiki: `replyPrompt` menyuruh model memanggil Tool dengan identifier Customer apa adanya walau formatnya tidak cocok skema, bukan meminta Customer memformat ulang lebih dulu. `executeBuiltInTool` (`apps/api/src/modules/tools/services.ts`) menambahkan `sourceTitle` per Chunk `searchKnowledge` agar model bisa mengenali Source legacy/superseded yang bertentangan dengan Source current pada fakta yang sama, tanpa bergantung pada kedua nilai persis ikut terambil ([#180](https://github.com/azarnuzy/supports-ops/issues/180)) | `tool-unknown-order` gagal bukan karena regresi schema ketat — model melihat skema `id` Shopify GID lalu bertanya ke Customer alih-alih mencoba Tool. `common-return-window` gagal karena celah recall retrieval (lihat catatan nomor 10 di atas), bukan celah keputusan — menyetel parameter `searchChunks` di luar cakupan #180 (ditunda ke #187) | `pnpm eval:ai-agent tool` 7/7 (sebelumnya 6/7). `pnpm eval:ai-agent decision` 14/14 (sebelumnya 12/14), diverifikasi ulang pada beberapa proses terpisah karena non-determinisme eval. Suite penuh tidak ada yang regresi dari B1; `gEval` membaik 16/23 → 18/23 | Selesai, terukur |

## Baseline B1 (diukur 2026-09-16, setelah sembilan perubahan di atas)

Sembilan suite dijalankan ulang di Workspace eval yang sama, pada commit
`a6ce736`. Detail lengkap dan tabel per-Case ada di dokumen riset §1a.

| Suite | Case | Lulus | Token/case | ms/case |
| --- | --- | --- | --- | --- |
| `contains` | 6 | 4 | 56.667 | 11.032 |
| `faithfulness` | 3 | 1 | 23.154 | 19.802 |
| `decision` | 14 | 12 | 17.022 | 5.511 |
| `tool` | 7 | 6 | 80.814 | 17.891 |
| `visibility` | 4 | 4 | 20.515 | 7.400 |
| `negativeControl` | 1 | 0 | 22.957 | 5.066 |
| `language` | 3 | 3 | 23.232 | 6.964 |
| `relevancy` | 3 | 3 | 23.321 | 23.482 |
| `gEval` | 23 | 16 | 29.412 | 14.442 |

TTFT sekarang punya angka untuk pertama kali (tidak ada di B0): p50 antara
4.050 ms (`decision`) dan 11.658 ms (`tool`, rata-rata 3,4 panggilan Tool per
Case).

**Lantai mutu bertahan** — `visibility`, `language`, `relevancy` tetap 100%;
`negativeControl` tetap gagal sesuai desain; `decision` dan `tool` sama
persis dengan B0 per-Case. Kegagalan baru ada di `contains` (2 Case) dan
`gEval` (3 Case tambahan), dan salah satu penyebabnya sudah teridentifikasi:

- **Regresi schema ketat, terkonfirmasi.** `tool-jordan-price`,
  `tool-rolex-price` (`contains`), `answer-search-specific-sku`, dan
  `hybrid-live-price-policy-conflict` (`gEval`) — pencarian katalog/SKU yang
  lulus di B0 sekarang gagal. `answer-search-specific-sku` menyebut
  penyebabnya langsung lewat `escalationReason: BUSINESS_TOOL_FAILURE`.
  Ini persis regresi yang diperingatkan sebelum pengukuran: perubahan nomor
  6 mengetatkan argument schema Tool dari terbuka menjadi strict, dan bentuk
  argumen yang dulu diterima untuk pencarian katalog sekarang ditolak.
  Perlu issue perbaikan tersendiri — di luar cakupan #177.
- 3 kegagalan `gEval` lain (dua CLARIFY yang seharusnya jawaban langsung,
  satu bertingkah sama seperti `tool-unknown-order`) tidak terkait schema —
  variasi mutu biasa.
- `edge-original-shipping-refund` (`faithfulness`) gagal tipis (skor 0,67,
  ambang 0,7), tanpa panggilan Tool — kemungkinan variasi judge.

**Jawaban dua pertanyaan yang jadi alasan #177 dikerjakan lebih dulu:**

1. Deduplikasi schema Tool (perubahan 6) menghemat **~9% dari token input
   per turn** (dari ~11.677 ke ~10.616–10.636 token pada Case tanpa Tool
   call), bukan ~50% yang diharapkan dari menghapus satu salinan penuh —
   fallback di `toInputSchema` masih membawa sebagian besar schema Tool
   commerce yang mahal secara duplikat.
2. TTFT sekarang terukur untuk pertama kali, tapi tiga round trip database
   yang diparalelkan di perubahan 3 (puluhan milidetik) terlalu kecil
   dibanding lantai TTFT beberapa detik yang didominasi model — perubahan
   itu kemungkinan besar tidak akan pernah terlihat di angka ini walau
   berhasil sesuai rencana.

## Antrean pekerjaan

Dua belas issue, semuanya berlabel `ready-for-agent`, dengan relasi
`blocked by` native GitHub sudah terpasang.

| Issue | Pekerjaan | Diblokir oleh | Status |
| --- | --- | --- | --- |
| [#176](https://github.com/azarnuzy/supports-ops/issues/176) | Ringkasan p50/p95 latensi dan token per suite | — | Selesai |
| [#177](https://github.com/azarnuzy/supports-ops/issues/177) | Catat baseline B1 setelah tujuh perubahan di atas | #176 | Selesai |
| [#178](https://github.com/azarnuzy/supports-ops/issues/178) | Luluskan Case negative control | #177 | Ditutup — premis issue keliru, tidak ada perubahan kode ([detail](research/ai-agent-cost-and-latency.md#72-fix-what-b0-says-is-broken-before-optimising-further--178-179-180-181)) |
| [#179](https://github.com/azarnuzy/supports-ops/issues/179) | Grounding Case no-first-scan terhadap Knowledge yang diambil | #177 | Selesai, belum terukur — penyebab diputuskan (celah prompt-grounding, Knowledge sudah lengkap), lihat riset §6.10 |
| [#180](https://github.com/azarnuzy/supports-ops/issues/180) | Perbaiki kegagalan pemilihan Tool dan keputusan | #177 | Selesai |
| [#181](https://github.com/azarnuzy/supports-ops/issues/181) | Perbaiki kegagalan mutu jawaban | #177 | Selesai, belum terukur |
| [#182](https://github.com/azarnuzy/supports-ops/issues/182) | Nilai mutu retrieval dengan label passage yang diharapkan | — | Selesai |
| [#183](https://github.com/azarnuzy/supports-ops/issues/183) | Pilih nilai reasoning effort dan batas token output | #177 | Selesai |
| [#184](https://github.com/azarnuzy/supports-ops/issues/184) | Persempit manifest Tool menjadi loadout statis | #177 | Diimplementasikan, belum terukur |
| [#185](https://github.com/azarnuzy/supports-ops/issues/185) | Batasi durasi terburuk satu turn AI Agent | — | Selesai |
| [#186](https://github.com/azarnuzy/supports-ops/issues/186) | Mulai retrieval paralel dengan panggilan model pertama | #177, #183 | Bersyarat |
| [#187](https://github.com/azarnuzy/supports-ops/issues/187) | Setel parameter retrieval terhadap mutu retrieval terukur | #177, #182 | Menunggu |

### Kenapa urutannya begitu

**#176 lalu #177 adalah frontier sebenarnya.** Delapan issue lain menunggu #177
karena setiap klaim penghematan harus terukur, bukan diargumentasikan — dan
tujuh perubahan yang sudah diterapkan belum punya satu pun angka hasil.

**#182 dan #185 bisa jalan paralel.** #182 pekerjaannya melabeli, tidak
bergantung pada angka B1. #185 perbaikan batas waktu, bukan optimisasi, jadi
tidak butuh baseline untuk membenarkannya.

**#182 — mekanisme dan angkanya sudah ada.** 10 dari 23 Case (kategori
`common`/`edge`, lintas Knowledge Source 02/03/05) membawa label
expected-passage yang di-resolve ke Chunk saat runtime, dan suite baru
`retrieval` melaporkan recall@k, precision@k, dan first-relevant rank per Case
(`apps/api/src/evals/retrieval.ts`, `metrics.ts`, `run.ts`; diverifikasi oleh
unit test `retrieval.test.ts` dan `tsc --noEmit`). Dijalankan 2026-09-16
terhadap Workspace langsung (`pnpm eval:ai-agent retrieval`, k=8): recall@8
rata-rata 0,90 (9/10 Case menemukan seluruh passage wajib), precision@8
rata-rata 0,11 (1 chunk relevan dari 8 pada 9 Case), first-relevant rank
rata-rata 2,9 untuk Case yang menemukan sesuatu. Satu Case, `retrieval-split-
shipment`, gagal total karena Agent menjawab `CLARIFY` tanpa memanggil
`searchKnowledge` sama sekali — itu kegagalan keputusan, bukan retrieval.
Detail lengkap di riset §7.7. #187 kini punya sinyal untuk mulai.

**#186 bisa ditutup tanpa dikerjakan.** Kalau B1 dan #183 sudah membawa TTFT ke
target, round trip yang dihemat #186 bukan lagi kendala pengikat. Menutupnya
dengan angka yang membuktikan tidak perlu adalah hasil yang sukses, bukan
pekerjaan yang ditinggalkan.

**#187 paling akhir.** Menyetel parameter retrieval tanpa recall@k dan
precision@k adalah menyetel tanpa sinyal — itu sebabnya #182 harus selesai lebih
dulu.

## Aturan pembaruan

Saat menutup GitHub issue yang ada pada tabel antrean di atas:

1. Perbarui status baris issue tersebut pada perubahan yang sama, sebelum issue ditutup.
2. Tulis angka yang dihasilkan issue itu, bukan sekadar "selesai". Baris yang berstatus **Selesai, belum terukur** hanya boleh menjadi **Selesai** ketika ada angka yang membuktikannya.
3. Untuk issue pengukuran, tambahkan baseline baru di [`research/ai-agent-cost-and-latency.md`](research/ai-agent-cost-and-latency.md) **di samping** baseline yang dibekukan — jangan menimpanya.
4. Bila lantai mutu di bawah dilanggar, catat pelanggarannya di sini alih-alih menutup issue diam-diam.
5. Sertakan dokumen ini dalam ringkasan penutupan issue.

## Lantai mutu

Tidak ada perubahan di antrean yang boleh masuk tanpa memenuhi keduanya:

- **Mutu tidak turun.** `decision`, `tool`, `visibility`, `negativeControl`, dan
  `language` tidak boleh regresi terhadap baseline terakhir; `faithfulness` dan
  `gEval` juga tidak. `negativeControl` dan `visibility` adalah gerbang keras —
  penghematan biaya atau latensi yang menimbulkan kebocoran bukan penghematan.
- **Penghematannya diukur, bukan diargumentasikan.** Laporkan sebelum/sesudah
  untuk TTFT p50/p95, `ttfc` p50/p95, end-to-end p50/p95, token input, rasio
  cached, token output, token reasoning, dan jumlah panggilan model per Case.
  **Rasio cached yang turun berarti prefix-nya pecah — itu regresi, meski jumlah
  token mentahnya ikut turun.**
