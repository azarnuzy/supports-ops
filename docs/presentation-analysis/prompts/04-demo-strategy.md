# 04 — Demo Strategy Analysis

Baca:

- `docs/presentation-analysis/00-analysis-contract.md`
- `docs/presentation-analysis/01-product-baseline.md`
- `docs/presentation-analysis/02-presentation-narrative.md`

Ikuti bagian **Aturan Bahasa** pada kontrak. Ceritakan demo sebagai perjalanan Customer, bukan sebagai daftar istilah teknis.

Kemudian analisis seluruh capability demo yang tersedia di project.

Cari:

- testing documentation
- E2E runbook
- seed data
- demo data
- workspace seed/configuration
- AI test cases
- business system
- customer identities
- knowledge
- tools
- MCP
- ticket workflow
- agent workflow
- WhatsApp flow/configuration
- Instructions
- Evaluation configuration

## Konteks Penting Demo

Sudah tersedia **satu workspace demo yang telah dikonfigurasi sebelumnya**.

Workspace tersebut sudah memiliki:

- MCP dengan Shopify
- Tools
- AI Instructions
- Evaluation
- User
- WhatsApp configuration
- konfigurasi workspace lain yang relevan

Workspace ini harus menjadi **centerpiece dari demo**.

Jangan mendesain demo seolah-olah presenter perlu membuat workspace dari nol.

Yang ingin ditunjukkan adalah:

> sebuah workspace yang sudah dikonfigurasi dapat menjalankan customer-support lifecycle yang memanfaatkan AI, Knowledge, Tools/MCP, Instructions, Human Handoff, Evaluation, dan Observability.

Coding agent harus memverifikasi konfigurasi tersebut terhadap actual implementation sebelum menjadikannya bagian dari demo.

## Tujuan Demo

Demo harus menjadi satu cerita, bukan kumpulan feature.

Kita ingin membuktikan minimal:

1. AI dapat menjawab menggunakan grounded knowledge.
2. AI dapat menggunakan business data melalui Tool atau MCP ketika knowledge saja tidak cukup.
3. Integrasi Shopify melalui MCP dapat memberikan business context atau action yang relevan jika memang didukung implementation.
4. Instructions pada workspace memengaruhi behavior AI jika memang benar-benar digunakan runtime.
5. AI dapat menentukan kapan percakapan tidak seharusnya diselesaikan sendiri.
6. Human Agent dapat mengambil alih percakapan dengan context yang sudah tersedia.
7. WhatsApp dapat menjadi salah satu channel demo jika implementasi dan environment mendukung.
8. Interaction yang terjadi dapat dibawa ke Observability / Evaluation sebagai bukti teknikal setelah demo.

Jangan mencoba mendemokan semua capability.

Cari jumlah skenario minimum yang dapat membuktikan konsep tersebut.

## Analisis Scenario

Pertimbangkan journey seperti:

### Scenario A — Knowledge Grounding

Customer  
→ knowledge question  
→ retrieval  
→ grounded response

### Scenario B — Business Context / Shopify

Customer  
→ order / customer / business question  
→ Tool atau Shopify MCP  
→ business data  
→ AI response

### Scenario C — Instruction-driven Behavior

Customer  
→ request yang dipengaruhi oleh workspace Instructions  
→ AI mengikuti policy / behavior yang telah dikonfigurasi

### Scenario D — Human Handoff

Customer  
→ unsupported / sensitive / explicit human request / tool failure  
→ escalation  
→ Human Agent  
→ continuation

### Scenario E — WhatsApp

Jika actual implementation dan environment siap:

WhatsApp user  
→ SupportOps  
→ AI flow  
→ response / escalation

Tidak semua scenario wajib dipakai.

Pilih kombinasi minimum yang paling kuat.

## Untuk setiap scenario identifikasi

- tujuan scenario
- persona
- channel
- initial workspace state
- customer/user
- ticket
- knowledge
- business data
- tool
- MCP
- Instructions
- expected AI behavior
- state transition
- UI yang digunakan
- backend dependency
- potensi failure
- bukti observability yang dihasilkan
- apakah cocok digunakan untuk evaluation

Kemudian tentukan:

- Apa yang harus disiapkan sebelum presentasi?
- Browser/tab apa saja yang perlu dibuka?
- Data apa yang harus diseed?
- State workspace apa yang harus sudah aktif?
- Shopify data apa yang harus tersedia?
- WhatsApp configuration apa yang harus diverifikasi?
- Tool apa yang harus sudah enabled?
- Instructions apa yang harus sudah disiapkan?
- Evaluation apa yang sudah tersedia?
- Apa yang cukup berisiko jika dilakukan live?
- Apa fallback jika AI menghasilkan wording berbeda?
- Apa fallback jika external integration gagal?
- Apa yang sebaiknya live dan apa yang bisa menjadi backup recording?

Selain demo execution, analisis juga bagaimana presenter dapat memperlihatkan bahwa workspace telah dikonfigurasi tanpa menghabiskan terlalu banyak waktu.

Contohnya mungkin berupa quick workspace tour:

Workspace  
→ Instructions  
→ Knowledge  
→ Tools  
→ MCP Shopify  
→ WhatsApp  
→ Evaluation

Tetapi jangan otomatis merekomendasikannya.

Tentukan apakah quick tour tersebut membantu atau malah membuat demo terlalu panjang.

## Output

A. Demo thesis

B. Peran workspace yang sudah dikonfigurasi

C. Recommended demo scenarios

D. Demo sequence

E. Quick workspace tour: perlu / tidak perlu

F. Environment preparation

G. Data preparation

H. Channel preparation

I. UI surfaces

J. State transition

K. Failure risks

L. Backup strategy

M. Pre-demo checklist

N. Bagian yang perlu dianalisis lebih detail kemudian

Jangan membuat exact customer dialogue terlebih dahulu.

Simpan ke:

`docs/presentation-analysis/04-demo-strategy.md`
