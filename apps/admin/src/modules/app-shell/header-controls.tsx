import { LanguageSwitcher, useTranslation } from "@repo/ui/i18n";
import { ThemeSelector } from "@repo/ui/components/theme-selector";

export function HeaderControls() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <ThemeSelector
        ariaLabel={t("theme.label")}
        labels={{
          dark: t("theme.options.dark"),
          light: t("theme.options.light"),
          system: t("theme.options.system"),
        }}
      />
      <LanguageSwitcher />
    </div>
  );
}
