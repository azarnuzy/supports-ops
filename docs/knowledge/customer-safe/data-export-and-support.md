# NusaWorkspace — Data Export, Service Status, and Support

**Visibility:** Customer-Safe  
**Policy owner:** Customer Operations  
**Effective:** 2026-09-01  
**Review cadence:** Quarterly

## Ekspor data

Admin workspace dapat membuka **Settings → Export**, memilih CSV atau JSON, lalu memulai ekspor. Ekspor dibuat secara asynchronous dan tautan download dikirim ke email Admin ketika siap. Tautan berlaku 24 jam.

Ekspor biasanya selesai dalam 15 menit. Workspace dengan lebih dari 100.000 activity records dapat memerlukan hingga 24 jam. Bila belum selesai setelah batas tersebut, Human Agent harus memeriksa job ekspor. Support tidak boleh mengirim file ekspor ke alamat selain email Admin yang terverifikasi.

## Penghapusan data

Setelah langganan berakhir, data workspace disimpan 30 hari sebelum dihapus permanen. Dalam periode itu, Admin dapat meminta pemulihan melalui Human Agent. Setelah 30 hari, data tidak dapat dipulihkan. Permintaan penghapusan lebih awal harus datang dari Admin workspace dan melalui verifikasi Human Agent.

## Status layanan

Status gangguan dipublikasikan di https://status.nusaworkspace.example. Saat ada incident aktif, Customer dapat berlangganan update dari halaman tersebut. AI Agent boleh menjelaskan status yang terdokumentasi, tetapi tidak boleh memperkirakan waktu pulih di luar update resmi.

## Dukungan

Email support tersedia Senin–Jumat, 09:00–17:00 WIB, tidak termasuk hari libur nasional Indonesia. Target respons awal Starter adalah dua hari kerja. Priority support Pro memiliki target respons awal empat jam kerja. Target respons bukan jaminan waktu penyelesaian.

Dugaan insiden keamanan diprioritaskan tanpa memandang paket dan selalu diteruskan ke Human Agent.

## Contoh pertanyaan retrieval

- "Bagaimana ekspor data sebagai JSON?"
- "Berapa lama link download ekspor berlaku?"
- "Berapa lama data disimpan setelah langganan berakhir?"
- "Jam support dan target respons paket Pro berapa?"

