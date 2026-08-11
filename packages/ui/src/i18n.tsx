import i18next, { type i18n, type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import type { ReactNode } from "react";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/select";

export { useTranslation };
export type { Resource };

export const supportedLanguages = ["en", "id"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage = "en" satisfies SupportedLanguage;

export const languageLabels = {
  en: "English",
  id: "Bahasa Indonesia",
} satisfies Record<SupportedLanguage, string>;

const languageShortLabels = {
  en: "EN",
  id: "ID",
} satisfies Record<SupportedLanguage, string>;

export type FrontendI18nOptions = {
  appName: string;
  defaultNamespace: string;
  resources: Resource;
  fallbackLanguage?: SupportedLanguage;
  storageKey?: string;
};

export function createFrontendI18n({
  appName,
  defaultNamespace,
  resources,
  fallbackLanguage = defaultLanguage,
  storageKey = `${appName}:language`,
}: FrontendI18nOptions) {
  const instance = i18next.createInstance();

  void instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      defaultNS: defaultNamespace,
      fallbackLng: fallbackLanguage,
      supportedLngs: [...supportedLanguages],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: storageKey,
      },
      react: {
        useSuspense: false,
      },
    });

  return instance;
}

export function AppI18nProvider({ children, i18n }: { children: ReactNode; i18n: i18n }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const activeLanguage = getSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <Select
      value={activeLanguage}
      onValueChange={(language) => {
        void i18n.changeLanguage(language);
      }}
    >
      <SelectTrigger
        aria-label={t("language.label")}
        className="h-8 min-w-[4.25rem] rounded-md border-border/70 bg-background/80 px-2 text-xs font-semibold text-foreground shadow-none hover:bg-accent focus-visible:ring-2"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-20">
        {supportedLanguages.map((language) => (
          <SelectItem key={language} className="text-xs font-semibold" value={language}>
            {languageShortLabels[language]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function getSupportedLanguage(language: string | undefined): SupportedLanguage {
  const normalizedLanguage = language?.split("-")[0];

  return (
    supportedLanguages.find((supportedLanguage) => supportedLanguage === normalizedLanguage) ??
    defaultLanguage
  );
}
