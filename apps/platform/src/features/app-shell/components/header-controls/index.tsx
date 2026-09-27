import { ThemeSelector } from "@repo/ui/components/theme-selector";
import { CreditBadge } from "../credit-badge";
import { WorkspaceSwitcher } from "../workspace-switcher";

export function HeaderControls() {
  return (
    <div className="flex items-center gap-2">
      <WorkspaceSwitcher />
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
