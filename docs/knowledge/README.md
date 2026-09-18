# Knowledge packs

Dua corpus tinggal di folder ini.

**Northstar Outfitters (aktif).** Delapan PDF `01_…` sampai `08_…` adalah Knowledge Source Workspace eval (`EVAL_WORKSPACE_ID`) yang dipakai `pnpm eval:ai-agent`: lima Customer-Safe, dua Internal-Only (`06_INTERNAL_…`, `07_INTERNAL_…`), dan satu legacy (`08_LEGACY_…`) yang sengaja tetap Published sebagai conflict fixture. Peran tiap file, hierarki kewenangannya, dan Case yang memakainya ada di [docs/testing/ai-agent-eval-cases.md](../testing/ai-agent-eval-cases.md).

**NusaWorkspace (legacy demo).** Sisa dokumen ini menjelaskan corpus markdown lama di `customer-safe/` dan `internal-only/`. Ia tidak dipakai eval; untuk demo end-to-end pakai [docs/demo/](../demo/) dan `pnpm seed:demo`.

## Knowledge pack NusaWorkspace

Corpus ini merepresentasikan **NusaWorkspace**, perusahaan SaaS B2B fiktif yang menyediakan workspace kolaborasi dan akses API. Seluruh kebijakan, harga, batas paket, kanal dukungan, serta prosedur internal dibuat konsisten agar dapat langsung dipakai untuk demo dan pengujian SupportOps.

Data akun dan tagihan demo diselaraskan dengan Business System lokal: Budi memakai Pro aktif dengan invoice USD 49 berstatus PAID; Siti memakai Starter PAST_DUE dengan invoice USD 19 OVERDUE.

## Dokumen dan visibility

| File | Title saat upload | Visibility |
| --- | --- | --- |
| `customer-safe/company-and-product.md` | NusaWorkspace — Company and Product Guide | Customer-Safe |
| `customer-safe/account-and-security.md` | NusaWorkspace — Account and Security | Customer-Safe |
| `customer-safe/plans-billing-and-refunds.md` | NusaWorkspace — Plans, Billing, Cancellation, and Refunds | Customer-Safe |
| `customer-safe/data-export-and-support.md` | NusaWorkspace — Data Export, Service Status, and Support | Customer-Safe |
| `internal-only/support-operations-playbook.md` | NusaWorkspace — Internal Support Operations Playbook | Internal-Only |

Setiap file harus dibuat sebagai Manual FAQ terpisah di `/knowledge`, memakai title dan visibility di atas, lalu dipublish. Jangan menggabungkan Internal-Only ke Customer-Safe.

## Cara sistem merujuknya

AI Agent hanya boleh membuat klaim perusahaan dari Customer-Safe atau data live Business Tool. Status paket, invoice, dan tanggal renewal wajib berasal dari Business Tool. Bila sumber tidak cukup, Tool gagal, Customer meminta tindakan tulis, atau kebijakan mensyaratkan keputusan manusia, AI Agent harus melakukan Escalation.

Setelah Ticket dimiliki Human Agent, AI Copilot boleh memakai Customer-Safe dan Internal-Only untuk Suggested Reply. Draft tetap harus ditinjau Human Agent dan tidak boleh membocorkan aturan internal.

Gunakan [case catalog](test-cases.md) setelah semua sumber berstatus Published.

