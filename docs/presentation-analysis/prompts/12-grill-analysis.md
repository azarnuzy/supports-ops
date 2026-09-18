# 12 — Grill / Verification Prompt

Baca dan ikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa**. Selain memeriksa kebenaran, tandai kalimat yang benar tetapi terlalu teknis atau sulit dipahami.

Gunakan prompt ini setelah salah satu analysis dossier selesai.

Ganti `[FILE_ANALISIS]` dengan file yang ingin diverifikasi.

---

Lakukan **GRILL** terhadap analisis berikut:

`[FILE_ANALISIS]`

Jangan menambahkan ide baru terlebih dahulu.

Challenge semua klaim penting yang ada di dokumen tersebut.

Untuk setiap klaim tanyakan:

1. Apa evidence source code-nya?
2. Apakah benar-benar IMPLEMENTED?
3. Apakah sebenarnya hanya documentation atau architectural intent?
4. Apakah ada edge case yang bertentangan?
5. Apa failure path-nya?
6. Mana yang AI-controlled?
7. Mana yang application-controlled?
8. Mana yang Instruction / policy / configuration-controlled?
9. Mana yang Tool / MCP-controlled?
10. Mana yang human-controlled?
11. Apakah informasi ini cukup penting untuk presentasi 15–20 menit?
12. Apakah senior engineer akan mempertanyakan klaim ini?
13. Apakah business stakeholder akan memahami kenapa hal ini penting?
14. Apakah dapat dijelaskan dengan lebih sederhana?
15. Apakah workspace demo benar-benar mendukung klaim tersebut?
16. Apakah konfigurasi MCP Shopify, Tools, Instructions, Evaluation, User, dan WhatsApp benar-benar terhubung ke runtime flow seperti yang diasumsikan?

Klasifikasikan setiap bagian:

- KEEP
- SIMPLIFY
- VERIFY
- REMOVE
- MOVE TO BACKUP

Untuk VERIFY, berikan:

- pertanyaan yang harus dijawab
- file/source yang harus diperiksa
- alasan kenapa belum dapat dipercaya

Setelah itu berikan versi rekomendasi struktur analisis yang lebih kuat.

Jangan membuat slide.

Jangan memodifikasi application source code.
