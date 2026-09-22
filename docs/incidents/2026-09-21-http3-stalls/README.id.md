# Server Cepat, Tapi Halaman Lambat: Gara-gara HTTP/3

*21 September 2026 · catatan debugging SupportOps*

[English](README.md) · **Bahasa Indonesia**

![Request yang sama lewat HTTP/3 dan lewat HTTP/2](request-path.png)

---

## Awalnya cuma satu Ticket yang lama kebuka

Siang itu saya buka Inbox SupportOps, lalu klik salah satu Ticket yang sudah resolved. Loading-nya sekitar sepuluh detik. Saya coba Ticket lain, langsung kebuka. Terus saya buka halaman utama `support.azarnuzy.com`, dan yang muncul cuma layar putih dengan loading yang muter terus.

Masalah yang "kadang cepat, kadang lambat" itu paling susah dilacak, karena penyebabnya bisa di mana saja. Dugaan pertama saya tentu saja servernya yang lambat. Mungkin ada query yang berat, mungkin RAM VPS-nya penuh, atau mungkin perlu ditambah caching.

Ternyata bukan itu semua. Servernya dari awal baik-baik saja. Masalahnya ada di **transport yang dipakai browser** untuk terhubung ke server. Di tulisan ini saya ceritakan bagaimana akhirnya saya sampai ke kesimpulan itu.

## Yang pertama kelihatan: response kecil cepat, response besar lambat

Saya buka DevTools, masuk ke tab Network, filter Fetch/XHR, lalu buka Ticket tadi sekali lagi.

![Tab Network DevTools saat membuka Ticket](01-network-fetch-xhr-list.png)

Hampir semua request selesai dalam 36–86 ms, kecuali satu: request detail Ticket, yang butuh **9,54 detik**. Kalau diperhatikan, makin besar response-nya, makin lama waktunya:

| Request | Ukuran | Waktu |
|---|---|---|
| `session`, `users`, `read` | < 1 kB | 36–80 ms |
| `tickets` (list) | ~3 kB | 394–485 ms |
| `tickets/:id` (detail) | ~16 kB | **9,54 s** |

Padahal beban kerja server untuk request-request ini kurang lebih sama. Yang beda adalah jumlah **packet** yang dibutuhkan. Response 16 kB dipecah jadi sekitar dua belas packet berukuran 1,2–1,5 kB. Kalau satu saja packet-nya hilang, seluruh response harus menunggu packet itu dikirim ulang.

## Server sebenarnya sudah menjawab dalam 124 ms

Saya klik request yang lambat tadi, lalu buka tab Timing.

![Panel Timing request Ticket yang lambat](04-ticket-detail-timing-download-9s.png)

- **Waiting for server response (TTFB): 124,57 ms**
- **Content download: 9,42 s**

Screenshot ini yang paling penting. TTFB menunjukkan berapa lama server memproses request: query, handler, dan logika bisnisnya. Content download menunjukkan berapa lama data dikirim sampai ke browser. API sudah selesai dalam 124 ms, sedangkan 9,4 detik sisanya habis hanya untuk mengirim 16 kB dari proxy ke laptop saya.

Artinya, database dan kode aplikasi bukan penyebabnya. Masalahnya ada di jalur antara server dan laptop.

## Mengecek kemungkinan lain

Saya cek monitoring VPS selama satu jam kejadian. Servernya nyaris tidak ada beban: rata-rata CPU **7,7%** (tertinggi 13,9%), memori **40%**, disk utilisation **0,02%**, dan rata-rata cuma 3 koneksi TCP. VPS 2 vCPU dengan CPU 8% jelas tidak butuh sembilan detik untuk mengirim 16 kB.

Lalu saya tes pakai `curl` dari laptop dan jaringan yang sama:

| Tes | Hasil |
|---|---|
| `GET /` (HTML shell), 3 kali | 0,18–0,23 s |
| `GET /assets/index-*.js` (253 kB), **30 kali** | **median 0,23 s**, paling lama 0,53 s |
| ICMP ping × 20 ke VPS | **0% loss**, RTT 47 ms |

Dari 30 kali percobaan, `curl` selalu cepat. Di saat yang sama, browser di laptop yang sama masih sering macet. Laptopnya sama, jaringannya sama, servernya juga sama. Lalu apa bedanya `curl` dengan browser?

Jawabannya ada di response header:

```
alt-svc: h3=":443"; ma=2592000
```

## Sebelum lanjut: apa itu `alt-svc`?

Supaya header ini bisa dipahami, perlu sedikit konteks soal cara kerja HTTP.

**TCP dan UDP.** Hampir semua trafik internet berjalan di atas salah satu dari dua protocol ini. **TCP** itu seperti kirim paket pakai resi: ada handshake di awal, setiap packet dikonfirmasi sudah sampai, dan packet yang hilang otomatis dikirim ulang oleh sistem operasi. **UDP** lebih sederhana: setiap packet (*datagram*) dikirim begitu saja tanpa dicek apakah sampai atau tidak. Router, NAT, dan firewall sudah puluhan tahun menangani TCP dengan baik. Sebaliknya, UDP sering dibatasi (rate-limit), diturunkan prioritasnya, bahkan diblokir.

**HTTP/2 dan HTTP/3.** HTTP/2 (2015) berjalan di atas TCP, dan banyak request bisa lewat satu koneksi yang sama (*multiplexing*). HTTP/3 (2022, [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114)) berjalan di atas **QUIC**, dan QUIC berjalan di atas **UDP**. QUIC menambahkan fitur-fitur yang biasanya dimiliki TCP (retransmission, ordering, congestion control, TLS 1.3) di atas UDP. Di jaringan yang tidak membatasi UDP, hasilnya bagus. Masalahnya, bagi jaringan, trafik QUIC tetap **dianggap trafik UDP biasa**.

**Alt-Svc.** Browser tidak pernah langsung pakai HTTP/3. Koneksi pertama selalu lewat TCP, lalu server memberi tahu bahwa ia juga mendukung HTTP/3 di UDP port 443, dan informasi ini disimpan browser selama 30 hari. Itulah arti `alt-svc: h3=":443"; ma=2592000` ([RFC 7838](https://www.rfc-editor.org/rfc/rfc7838)). Setelah itu, browser beralih ke QUIC.

Yang perlu dicatat: saya tidak pernah mengaktifkan HTTP/3. **Caddy mengaktifkannya secara default**, karena nilai default opsi `protocols` adalah `h1 h2 h3` ([dokumentasi](https://caddyserver.com/docs/caddyfile/options)). Jadi HTTP/3 sudah aktif sejak deploy pertama.

Dari sini semuanya mulai masuk akal. `curl` memakai **HTTP/2 di atas TCP**, sedangkan browser sudah menerima `alt-svc` dan memakai **HTTP/3 di atas QUIC (UDP)**. Dan waktu itu saya sedang pakai **hotspot HP**.

## Tes yang membuktikan penyebabnya

Supaya yakin, dugaan ini harus dites. Saya buka `brave://flags/#enable-quic` lalu ubah **Experimental QUIC protocol** menjadi *Disabled*.

![Halaman flags Brave dengan opsi QUIC](09-brave-flags-enable-quic.png)

Selain itu tidak ada yang saya ubah: servernya sama, jaringannya sama, halamannya juga sama. Hasilnya, aplikasi jadi **lancar sekali**. Semua Ticket langsung terbuka.

Tes A/B inilah yang jadi bukti utamanya. Langkah-langkah sebelumnya membantu mempersempit kemungkinan, sedangkan tes ini yang memastikan penyebabnya.

## Kenapa UDP bermasalah di hotspot HP

Jaringan seluler memang dikenal kurang ramah untuk UDP. Ada tiga penyebab utamanya:

- **NAT binding yang singkat.** Di jaringan seluler, satu IP publik dipakai bersama oleh ribuan pelanggan lewat **CGNAT** (Carrier-Grade NAT). Koneksi TCP punya awal dan akhir yang jelas, jadi NAT bisa melacaknya dengan mudah. UDP tidak punya penanda seperti itu, sehingga NAT hanya menyimpannya selama waktu tertentu. Menurut [RFC 9308 §3.2](https://www.rfc-editor.org/rfc/rfc9308#section-3.2), binding UDP *"can expire after just thirty seconds of inactivity"*.
- **MTU yang lebih kecil.** Tethering dan tunnel di jaringan operator memperkecil ukuran maksimum packet (**MTU**). TCP bisa menyesuaikan dengan mengirim segment yang lebih kecil. QUIC tidak bisa, karena datagram-nya minimal 1200 byte ([RFC 9000 §14.1](https://www.rfc-editor.org/rfc/rfc9000#section-14.1)) dan **tidak boleh** difragmentasi ([§14.2](https://www.rfc-editor.org/rfc/rfc9000#section-14.2)). Packet yang kebesaran langsung dibuang tanpa ada pemberitahuan.
- **UDP shaping.** RFC 9308 §2 menyebutkan bahwa *"between 3% and 5% of networks block all UDP traffic"*. Ada juga jaringan yang tidak memblokir UDP tapi memperlambatnya, dan yang seperti ini jauh lebih sulit dideteksi.

## Yang bikin kaget: browser tidak otomatis pindah ke TCP

Biasanya kita berasumsi browser akan pindah ke TCP kalau QUIC gagal. Itu memang benar, tapi hanya dalam kondisi tertentu. Ian Swett, engineer QUIC di Chromium, [menjelaskan](https://groups.google.com/a/chromium.org/g/proto-quic/c/cWoQxBMopR0):

> If the handshake fails (i.e. UDP is blackholed), Chrome will mark QUIC as broken, then retry the request over TCP without the user having to reload. […] **If a request fails post handshake, there is no auto-retry.**

Nah, ini dia penjelasannya. Kalau UDP diblokir **sepenuhnya**, handshake akan gagal dan browser diam-diam pindah ke TCP, jadi pengguna tidak merasakan apa-apa. Tapi kalau UDP hanya bermasalah **sebagian**, packet handshake yang kecil masih bisa lewat, sehingga koneksinya kelihatan normal. Lalu packet yang lebih besar, yang berisi body response, banyak yang hilang, dan request-nya menggantung.

Kalau diurutkan, kejadiannya seperti ini:

1. Caddy mengirim `alt-svc: h3`, lalu browser beralih ke QUIC.
2. Handshake QUIC berhasil.
3. API menjawab dalam 124 ms, dan header sampai ke browser.
4. Sebagian packet UDP berukuran penuh yang berisi body hilang di jalur hotspot. QUIC mengirim ulang dengan jeda yang terus bertambah (exponential back-off), sehingga download-nya jadi 9 detik, atau bahkan tidak pernah selesai.
5. Karena gagalnya terjadi **setelah** handshake, Chromium tidak mencoba ulang lewat TCP. Browser tetap mencoba HTTP/3 lagi di request berikutnya, makanya hasilnya kadang cepat, kadang lambat.

**Jadi servernya sebenarnya cepat. Yang bermasalah adalah transport yang dipilih browser, yang tidak stabil di jaringan tersebut.**

## Ternyata banyak yang mengalami hal serupa

Saya cari di GitHub issues Caddy, dan ternyata pola yang sama muncul di beberapa issue:

- [#7556](https://github.com/caddyserver/caddy/issues/7556): `ERR_QUIC_PROTOCOL_ERROR` yang muncul sesekali di Chrome. Salah satu komentar menyebutkan *"response headers flush, some body bytes arrive, then the stream aborts mid-body"*, persis dengan yang saya alami: header cepat, tapi body macet. Mengatur `QUIC_GO_DISABLE_GSO=true` bisa mengurangi jumlah abort.
- [#5942](https://github.com/caddyserver/caddy/issues/5942): request di Firefox timeout *"after several clicks all served successfully over HTTP/3"*.
- [#6537](https://github.com/caddyserver/caddy/issues/6537) (masih open): *http3 breaks SSE*. Ini relevan karena Inbox SupportOps memakai SSE.
- [#7885](https://github.com/caddyserver/caddy/issues/7885): HTTP/3 lewat Tailscale gagal karena MTU, contoh nyata dari masalah MTU di atas.
- [#5075](https://github.com/caddyserver/caddy/issues/5075): cara menonaktifkan HTTP/3. Jawaban dari maintainer-nya sama persis dengan fix yang saya pakai.

Kebanyakan issue ini ditutup tanpa root cause yang pasti. Penyebabnya memang sulit direproduksi karena ada di jalur jaringan, di UDP offload kernel (GSO), atau di library QUIC-nya (quic-go). Solusi yang biasa disarankan selalu sama: **nonaktifkan HTTP/3 dan pakai TCP saja.**

## Fix-nya cukup tiga baris

Opsi `protocols` di Caddy berlaku **global**, jadi harus ditaruh di global options block paling atas Caddyfile utama, bukan di site block. Kalau ditaruh di file site, hasilnya syntax error.

```caddy
{
	email <admin email>
	servers {
		protocols h1 h2
	}
}

import /etc/caddy/apps/*.caddy
```

Pengaturan ini berlaku untuk semua site di instance Caddy tersebut, dan memang itu yang saya inginkan. Setelah itu, validasi lalu reload (tanpa downtime):

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload   --config /etc/caddy/Caddyfile
```

Lalu pastikan tidak ada lagi domain yang mengirim header HTTP/3:

```bash
for h in support api.support widget.support; do
  echo "$h: $(curl -sI https://$h.azarnuzy.com | grep -i alt-svc || echo 'no alt-svc')"
done
```

Ketiga domain menampilkan `no alt-svc`. Browser yang masih menyimpan `alt-svc` lama mungkin masih mencoba HTTP/3 untuk sementara waktu. Untuk memastikan fix-nya sudah jalan, restart browser atau buka private window.

## Apa ruginya tanpa HTTP/3?

| Kelebihan HTTP/3 | Pengaruhnya ke SupportOps |
|---|---|
| Setup koneksi lebih cepat (1 RTT, bukan 2–3) | Hemat sekitar 50–100 ms dengan RTT 47 ms, itu pun hanya di koneksi **baru**. Dashboard memakai koneksi yang sama berulang kali. |
| Tidak ada head-of-line blocking antar stream | Terasa kalau ada banyak request paralel di jaringan yang sering packet loss. Halaman kami hanya memanggil beberapa endpoint JSON kecil. |
| Connection migration (Wi-Fi ↔ seluler) | Berguna untuk pengguna HP. Human Agent umumnya bekerja dari laptop. |
| Lebih baik di jaringan seluler yang jelek | Secara teori iya. Nyatanya, justru di jaringan seluler HTTP/3 bermasalah. |

HTTP/2 di atas TCP bukan teknologi usang. TLS 1.3 dan multiplexing HTTP/2 tetap didapat. Kerugiannya paling banyak sekitar 100 ms saat membuka koneksi baru, sedangkan keuntungannya tidak ada lagi macet 9 detik yang tidak bisa dipulihkan browser. Menurut saya ini jelas sepadan.

Kalau nanti HTTP/3 mau diaktifkan lagi, yang pertama perlu dicoba adalah `QUIC_GO_DISABLE_GSO=true` di container Caddy. Sebelum itu, sebaiknya sudah ada cara untuk memantau performa HTTP/3 di berbagai jaringan client.

## Yang belum bisa dipastikan

Ada beberapa hal yang tidak bisa dibuktikan dari data yang saya punya:

- **Di titik mana UDP-nya bermasalah.** Tes A/B membuktikan bahwa QUIC penyebabnya, tapi belum bisa menunjukkan apakah masalahnya di CGNAT operator, MTU hotspot, UDP shaping, atau perilaku quic-go/GSO seperti di #7556. Untuk tahu pastinya, perlu packet capture atau `qlog`.
- **Protocol yang dipakai tiap request yang lambat.** Waktu kejadian, kolom **Protocol** di DevTools belum saya aktifkan, jadi saya tidak bisa menunjukkan langsung bahwa request 9,42 detik itu memakai `h3`. Kesimpulan ini didasarkan pada hasil tes A/B.
- **Perbandingan dengan jaringan lain.** Saya belum sempat membandingkan dengan internet rumah atau kantor saat HTTP/3 masih aktif. Tapi fix-nya tidak bergantung pada hal ini, karena sekarang semua client tidak lagi memakai UDP.

## Pelajaran: langkah debug kalau ada laporan "halaman lambat"

Mulai dari lapisan paling bawah, lalu naik ke atas. Setiap langkah bisa dilakukan dalam waktu kurang dari semenit.

1. **Lihat tab Timing.** Kalau *Waiting for server response* yang tinggi, masalahnya di proses server, langsung ke langkah 6. Kalau *Content download* yang tinggi sedangkan waiting-nya rendah, masalahnya di pengiriman data, lanjut ke langkah berikutnya.
2. **Aktifkan kolom Protocol** di DevTools → Network. Kalau request yang lambat memakai `h3`, curigai transport-nya lebih dulu.
3. **Cek apakah server mengirim header HTTP/3:** `curl -sI https://support.azarnuzy.com | grep -i alt-svc`.
4. **Bandingkan dengan TCP.** Tes URL yang sama berkali-kali pakai `curl`. Kalau `curl` selalu cepat tapi browser tidak, masalahnya ada di bawah layer HTTP.
5. **Lakukan tes A/B.** Nonaktifkan QUIC (`chrome://flags/#enable-quic` atau `brave://flags/#enable-quic`), atau coba pakai jaringan lain. Kalau masalahnya hilang, berarti penyebabnya di transport.
6. **Cek server:** monitoring VPS, lalu log API dan `docker logs caddy`.
7. **Terakhir, baru profiling kode:** query, N+1, dan ukuran payload.

Pelajaran terbesar buat saya: dari panel timing DevTools, kelihatannya server lambat mengirim data. Wajar kalau langsung terpikir untuk mengoptimasi API, menambah caching, atau upgrade VPS. Padahal tidak ada satu pun yang akan menyelesaikan masalahnya. **Cari tahu dulu di mana waktunya habis, baru perbaiki.**

---

## Referensi

**Spesifikasi**

- [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000): §14.1 (minimum 1200 byte), §14.2 (tanpa IP fragmentation)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114): §3.1.1 (discovery lewat Alt-Svc)
- [RFC 9308: Applicability of QUIC](https://www.rfc-editor.org/rfc/rfc9308): §2 (3–5% jaringan memblokir UDP), §3.2 (NAT binding 30 detik)
- [RFC 7838: HTTP Alternative Services](https://www.rfc-editor.org/rfc/rfc7838)

**Caddy dan quic-go**

- [Caddy global options: `servers` → `protocols`](https://caddyserver.com/docs/caddyfile/options)
- Issue Caddy: [#7556](https://github.com/caddyserver/caddy/issues/7556) · [#5942](https://github.com/caddyserver/caddy/issues/5942) · [#6678](https://github.com/caddyserver/caddy/issues/6678) · [#6537](https://github.com/caddyserver/caddy/issues/6537) · [#7885](https://github.com/caddyserver/caddy/issues/7885) · [#5075](https://github.com/caddyserver/caddy/issues/5075) · [#3833](https://github.com/caddyserver/caddy/issues/3833)
- [quic-go #4394: GSO severely degrades connection performance](https://github.com/quic-go/quic-go/issues/4394)

**Perilaku browser**

- [Chromium proto-quic: QUIC client timeouts and failover to h2](https://groups.google.com/a/chromium.org/g/proto-quic/c/cWoQxBMopR0)

*Sumber diagram: [`request-path.html`](request-path.html).*
