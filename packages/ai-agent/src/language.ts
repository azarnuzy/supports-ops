/**
 * A rough, deterministic language check: counts common stopwords for each
 * supported language and requires the winner to have the most hits. Not a
 * real language detector, but stable, free, and enough to pin down which
 * language a Customer-facing draft should be written in, rather than relying
 * on the model to infer it correctly on every call.
 */
const stopwords = {
  en: ["the", "is", "are", "you", "your", "please", "thanks", "thank", "help", "and"],
  id: ["yang", "adalah", "anda", "kamu", "tolong", "terima", "kasih", "bantu", "dan", "sudah"],
} as const;

export type SupportedLanguage = keyof typeof stopwords;

const languageNames: Record<SupportedLanguage, string> = {
  en: "English",
  id: "Indonesian",
};

export function detectLanguage(text: string): SupportedLanguage | "unknown" {
  const lower = text.toLocaleLowerCase();
  const scores = Object.entries(stopwords).map(([language, words]) => ({
    language: language as SupportedLanguage,
    score: words.filter((word) => new RegExp(`\\b${word}\\b`, "u").test(lower)).length,
  }));
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score > 0 ? best.language : "unknown";
}

/** Human-readable name for a detected language, for use in a model prompt. */
export function languageName(language: SupportedLanguage): string {
  return languageNames[language];
}
