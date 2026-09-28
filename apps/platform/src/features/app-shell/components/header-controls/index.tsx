import { ThemeSelector } from "@repo/ui/components/theme-selector";
import { CreditBadge } from "../credit-badge";

export function HeaderControls() {
  return (
    <div className="flex items-center gap-2">
      <CreditBadge />
      <ThemeSelector
        ariaLabel="Theme"
        labels={{
          dark: "Dark",
          light: "Light",
          system: "System",
        }}
      />
    </div>
  );
}
