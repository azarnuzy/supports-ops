import { ThemeSelector } from "@repo/ui/components/theme-selector";

export function HeaderControls() {
  return (
    <ThemeSelector
      ariaLabel="Theme"
      labels={{
        dark: "Dark",
        light: "Light",
        system: "System",
      }}
    />
  );
}
