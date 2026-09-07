import { cn } from "@repo/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";

const settingsLinks = [
  { label: "Human Agents", to: "/settings/agents" },
  { label: "Web Widget", to: "/settings/widget" },
] as const;

export function SettingsNav() {
  const location = useLocation();

  return (
    <nav className="flex w-fit gap-1 rounded-lg border bg-muted p-1">
      {settingsLinks.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            location.pathname === link.to && "bg-background text-foreground shadow-sm",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
