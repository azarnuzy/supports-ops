# NusaWorkspace — Internal Support Operations Playbook

**Visibility:** Internal-Only  
**Policy owner:** Head of Customer Operations  
**Effective:** 2026-09-01  
**Review cadence:** Monthly

Dokumen ini hanya untuk Human Agent dan AI Copilot. Jangan mengutip aturan internal, ambang risiko, atau kode antrean kepada Customer.

## Routing dan prioritas internal

Permintaan manusia eksplisit, Business Tool failure, permintaan perubahan akun/billing, sengketa pembayaran, dan ketiadaan Customer-Safe grounding harus dieskalasi. Dugaan account takeover atau credential leak diberi priority URGENT dan diteruskan ke queue SEC-INCIDENT. Gangguan yang berdampak pada lebih dari satu Customer diteruskan ke queue SERVICE-INCIDENT.

Refund yang memenuhi syarat publik sampai USD 50 dapat disetujui Human Agent setelah verifikasi invoice dan penggunaan. Refund di atas USD 50, refund di luar kebijakan, atau chargeback memerlukan persetujuan Finance Lead. Jangan menyampaikan ambang USD 50; katakan bahwa permintaan ditinjau berdasarkan detail akun dan tagihan.

## Verifikasi

Gunakan Business Tool untuk mencocokkan nama, email, paket, status invoice, dan subscription. Jangan meminta password, OTP, recovery code, API key, atau nomor kartu penuh. Perubahan email memerlukan konfirmasi dari email lama; jika email lama tidak dapat diakses, teruskan ke Security Review.

## Handoff

Escalation Summary harus memuat: tujuan Customer, alasan eskalasi baku, fakta dari Customer-Safe Knowledge, hasil Business Tool, tindakan yang sudah dicoba, risiko, dan next action. Bedakan fakta dengan dugaan.

Suggested Reply adalah draft. Human Agent wajib menghapus detail internal, memastikan bahasa mengikuti Customer, dan memeriksa bahwa setiap klaim kebijakan tersedia dalam Customer-Safe Knowledge sebelum mengirim.

## Respons aman

Untuk refund: "Saya akan meninjau detail tagihan dan penggunaan akun Anda. Kami akan memberi kabar setelah pemeriksaan selesai."

Untuk Tool failure: "Saya belum dapat memverifikasi detail akun Anda saat ini. Saya meneruskan kasus ini agar tim kami dapat memeriksanya dengan aman."

Untuk insiden keamanan: "Kami memprioritaskan laporan ini. Segera rotasi credential yang mungkin terekspos; tim kami akan melanjutkan pemeriksaan akun Anda."

