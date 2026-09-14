# SupportOps Domain Modeling Resources

## Knowledge

- [Microsoft Learn: Use domain analysis to model microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis)
  Panduan resmi untuk Ubiquitous Language, subdomain, Bounded Context, dan Context Map. Gunakan untuk analisis strategis DDD; penerapannya tidak mengharuskan microservices.
- [Microsoft Learn: Use tactical DDD to design microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design)
  Panduan resmi untuk entity, value object, aggregate, invariant, dan service. Gunakan saat membaca bentuk model dan batas transaksi.
- [Microsoft Learn: Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)
  Panduan resmi tentang adapter penerjemah di antara model yang berbeda. Gunakan saat membaca integrasi Channel atau Business System.
- [`CONTEXT.md`](CONTEXT.md)
  Sumber otoritatif bahasa domain SupportOps. Baca sebelum menamai atau menafsirkan fitur.
- [`docs/agents/domain.md`](docs/agents/domain.md)
  Aturan repo untuk satu glossary dan satu konteks bahasa di seluruh aplikasi serta package.
- [`docs/adr/`](docs/adr/)
  Catatan alasan keputusan arsitektur. Gunakan untuk membedakan desain sadar dari kebetulan implementasi.

## Wisdom (Communities)

- [DDD Community](https://www.dddcommunity.org/)
  Komunitas yang dirintis oleh Eric Evans untuk artikel dan diskusi praktik DDD. Gunakan ketika batas model nyata masih ambigu setelah membaca kode dan berbicara dengan domain expert.
