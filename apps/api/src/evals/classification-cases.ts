import type { TicketPriority } from "@repo/ai-agent";

export type ClassificationEvalCase = {
  id: string;
  message: string;
  history?: Array<{ role: "agent" | "customer"; content: string }>;
  expected:
    | { qualifies: false; language: "en" | "id" }
    | {
        qualifies: true;
        category?: string;
        /** Only assert title language when the message has enough language context. */
        language?: "en" | "id";
        priority?: TicketPriority;
        titleIncludes?: string[];
      };
  critical?: boolean;
};

/** A compact pre-Ticket set: each Case covers a distinct routing or language risk. */
export const classificationCases: ClassificationEvalCase[] = [
  { id: "greeting-hi", message: "hi", expected: { qualifies: false, language: "en" } },
  { id: "greeting-halo", message: "Halo", expected: { qualifies: false, language: "id" } },
  {
    id: "language-ms-greeting",
    message: "Selamat petang",
    expected: { qualifies: false, language: "id" },
  },
  {
    id: "language-jv-greeting",
    message: "Nuwun sewu",
    expected: { qualifies: false, language: "id" },
  },
  {
    id: "language-tl-greeting",
    message: "Kumusta po",
    expected: { qualifies: false, language: "en" },
  },
  {
    id: "history-indonesian-hi",
    message: "hi",
    history: [
      { role: "customer", content: "Halo, saya mau tanya" },
      { role: "agent", content: "Hai! Ada yang bisa saya bantu?" },
    ],
    expected: { qualifies: false, language: "id" },
  },
  {
    id: "history-thanks-after-answer",
    message: "terima kasih",
    history: [
      { role: "customer", content: "Saya mau bertanya soal pesanan" },
      { role: "agent", content: "Tentu, apa yang ingin ditanyakan?" },
    ],
    expected: { qualifies: false, language: "id" },
  },
  {
    id: "unrelated-weather",
    message: "What is the weather today?",
    expected: { qualifies: false, language: "en" },
  },
  {
    id: "mixed-hi-order",
    message: "hi, where is my order NS-10482?",
    expected: { qualifies: true, titleIncludes: ["order"] },
    critical: true,
  },
  {
    id: "mixed-halo-refund",
    message: "Halo, refund saya belum masuk setelah 2 minggu",
    expected: { qualifies: true, category: "BILLING", titleIncludes: ["refund"] },
    critical: true,
  },
  {
    id: "mixed-thanks-billing",
    message: "Thanks, but my card was charged twice and I need this fixed urgently.",
    expected: { qualifies: true, category: "BILLING", priority: "HIGH", titleIncludes: ["charg"] },
    critical: true,
  },
  {
    id: "account-lockout",
    message: "Akun saya terkunci dan saya tidak bisa masuk sama sekali.",
    expected: {
      qualifies: true,
      category: "ACCOUNT",
      priority: "HIGH",
      titleIncludes: ["akun", "masuk", "terkunci"],
    },
    critical: true,
  },
  {
    id: "technical-cosmetic",
    message: "The button alignment looks slightly off on mobile.",
    expected: {
      qualifies: true,
      category: "TECHNICAL",
      priority: "LOW",
      titleIncludes: ["button", "mobile", "alignment"],
    },
  },
  {
    id: "subscription-cancel",
    message: "How do I cancel my subscription next month?",
    expected: {
      qualifies: true,
      category: "SUBSCRIPTION",
      priority: "NORMAL",
      titleIncludes: ["cancel", "subscription"],
    },
    critical: true,
  },
  {
    id: "language-id-support",
    message: "Saya tidak bisa masuk ke akun saya karena kata sandi selalu ditolak.",
    expected: {
      qualifies: true,
      category: "ACCOUNT",
      language: "id",
      titleIncludes: ["akun", "sandi", "masuk"],
    },
    critical: true,
  },
  {
    id: "language-en-support",
    message: "I cannot sign in to my account because my password is rejected.",
    expected: {
      qualifies: true,
      category: "ACCOUNT",
      language: "en",
      titleIncludes: ["account", "password", "sign"],
    },
    critical: true,
  },
  {
    id: "language-tl-support",
    message: "Hindi ako makapag-login sa account ko dahil ayaw tanggapin ang password.",
    expected: {
      qualifies: true,
      category: "ACCOUNT",
      language: "en",
      titleIncludes: ["account", "password", "login", "sign"],
    },
    critical: true,
  },
  {
    id: "history-elliptical-problem",
    message: "yang itu belum masuk juga",
    history: [
      { role: "customer", content: "Saya menunggu refund pesanan NS-10482" },
      { role: "agent", content: "Bisa jelaskan kendalanya?" },
    ],
    expected: { qualifies: true, category: "BILLING", titleIncludes: ["refund"] },
    critical: true,
  },
];
