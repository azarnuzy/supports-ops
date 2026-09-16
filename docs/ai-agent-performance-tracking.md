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
| 7 | Knob `LLM_MAIN_MAX_OUTPUT_TOKENS` dan `LLM_MAIN_REASONING_EFFORT` | 51,5% token output adalah reasoning, dan token output yang mendominasi waktu generasi | Belum ada — **keduanya default kosong, perilaku belum berubah**. Yang dikirim adalah knob-nya, bukan keputusannya | Selesai, nilai belum dipilih |

Tidak ada dependensi baru yang ditambahkan. Konversi JSON Schema pada perubahan
nomor 6 memakai Zod 4.4 yang sudah terpasang, dengan fallback ke bentuk lama bila
sebuah schema tidak bisa dikonversi, sehingga tidak ada Tool yang kehilangan
argumennya.

## Antrean pekerjaan

Dua belas issue, semuanya berlabel `ready-for-agent`, dengan relasi
`blocked by` native GitHub sudah terpasang.

| Issue | Pekerjaan | Diblokir oleh | Status |
| --- | --- | --- | --- |
| [#176](https://github.com/azarnuzy/supports-ops/issues/176) | Ringkasan p50/p95 latensi dan token per suite | — | Siap dikerjakan |
| [#177](https://github.com/azarnuzy/supports-ops/issues/177) | Catat baseline B1 setelah tujuh perubahan di atas | #176 | Menunggu |
| [#178](https://github.com/azarnuzy/supports-ops/issues/178) | Luluskan Case negative control | #177 | Menunggu |
| [#179](https://github.com/azarnuzy/supports-ops/issues/179) | Grounding Case no-first-scan terhadap Knowledge yang diambil | #177 | Menunggu |
| [#180](https://github.com/azarnuzy/supports-ops/issues/180) | Perbaiki kegagalan pemilihan Tool dan keputusan | #177 | Menunggu |
| [#181](https://github.com/azarnuzy/supports-ops/issues/181) | Perbaiki kegagalan mutu jawaban | #177 | Menunggu |
| [#182](https://github.com/azarnuzy/supports-ops/issues/182) | Nilai mutu retrieval dengan label passage yang diharapkan | — | Siap dikerjakan |
| [#183](https://github.com/azarnuzy/supports-ops/issues/183) | Pilih nilai reasoning effort dan batas token output | #177 | Menunggu |
| [#184](https://github.com/azarnuzy/supports-ops/issues/184) | Persempit manifest Tool menjadi loadout statis | #177 | Menunggu |
| [#185](https://github.com/azarnuzy/supports-ops/issues/185) | Batasi durasi terburuk satu turn AI Agent | — | Siap dikerjakan |
| [#186](https://github.com/azarnuzy/supports-ops/issues/186) | Mulai retrieval paralel dengan panggilan model pertama | #177, #183 | Bersyarat |
| [#187](https://github.com/azarnuzy/supports-ops/issues/187) | Setel parameter retrieval terhadap mutu retrieval terukur | #177, #182 | Menunggu |

### Kenapa urutannya begitu

**#176 lalu #177 adalah frontier sebenarnya.** Delapan issue lain menunggu #177
karena setiap klaim penghematan harus terukur, bukan diargumentasikan — dan
tujuh perubahan yang sudah diterapkan belum punya satu pun angka hasil.

**#182 dan #185 bisa jalan paralel.** #182 pekerjaannya melabeli, tidak
bergantung pada angka B1. #185 perbaikan batas waktu, bukan optimisasi, jadi
tidak butuh baseline untuk membenarkannya.

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
