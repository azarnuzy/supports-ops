import { ThemePresetSelector, ThemeSelector } from "@repo/ui/components/theme-selector";

export function HeaderControls() {
  return (
    <div className="flex items-center gap-2">
      <ThemeSelector
        ariaLabel="Theme"
        labels={{
          dark: "Dark",
          light: "Light",
          system: "System",
        }}
      />
      <ThemePresetSelector className="hidden sm:block" />
    </div>
  );
}
