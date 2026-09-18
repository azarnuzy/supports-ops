# SupportOps Presentation Analysis Prompts

Kumpulan prompt ini digunakan untuk menganalisis project SupportOps secara langsung dari root repository menggunakan coding agent.

## Tujuan

Membangun dasar analisis untuk presentasi profesional berdurasi sekitar 15–20 menit yang menggabungkan:

- business context
- product story
- live demo
- system architecture
- message processing
- AI agent architecture
- observability
- evaluation
- cost simulation

## Konteks Demo

Sudah tersedia satu workspace demo yang telah dikonfigurasi dengan:

- MCP Shopify
- Tools
- AI Instructions
- Evaluation
- User
- WhatsApp configuration
- konfigurasi workspace lain yang relevan

Workspace tersebut menjadi environment utama untuk demo.

Demo tidak dimulai dari proses konfigurasi workspace dari nol.

## Urutan Penggunaan

1. Jalankan `00-analysis-contract.md` sebagai aturan dasar.
2. Jalankan `01-product-baseline.md`.
3. Verifikasi dengan `12-grill-analysis.md`.
4. Lanjutkan `02-presentation-narrative.md`.
5. Jalankan analisis per domain `03` sampai `09`.
6. Grill setiap hasil analisis.
7. Jalankan `10-visual-assets.md`.
8. Terakhir jalankan `11-presentation-blueprint.md`.

## Prinsip Utama

Jangan langsung membuat slide.

Semua prompt wajib membaca dan mengikuti `docs/presentation-analysis/00-analysis-contract.md`, terutama bagian **Aturan Bahasa** dan **Fakta Environment yang Sudah Dikonfirmasi**. Hasil harus mudah dipahami oleh audience campuran dan tetap natural ketika dibacakan.

Gunakan urutan:

Product Model  
→ Narrative  
→ Domain Analysis  
→ Verification  
→ Visual Strategy  
→ Presentation Blueprint  
→ Final Slide Content

Actual implementation di repository adalah source of truth utama.
