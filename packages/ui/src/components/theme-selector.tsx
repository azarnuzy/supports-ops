"use client";

import * as React from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

const themeOptions = [
  { icon: MonitorIcon, label: "System", value: "system" },
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
] as const;

type ThemeValue = (typeof themeOptions)[number]["value"];

type ThemeSelectorProps = {
  ariaLabel?: string;
  className?: string;
  labels?: Partial<Record<ThemeValue, string>>;
};

function ThemeProvider({
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = true,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    />
  );
}

function ThemeSelector({ ariaLabel = "Theme", className, labels }: ThemeSelectorProps) {
  const { setTheme, theme } = useTheme();
  const activeTheme = getThemeValue(theme);

  return (
    <Select value={activeTheme} onValueChange={(value) => setTheme(getThemeValue(value))}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-8 min-w-[6.25rem] rounded-md border-border/70 bg-background/80 px-2 text-xs font-semibold text-foreground shadow-none hover:bg-accent focus-visible:ring-2",
          className,
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-32">
        {themeOptions.map((option) => {
          const Icon = option.icon;

          return (
            <SelectItem key={option.value} className="text-xs font-medium" value={option.value}>
              <Icon className="size-3.5" />
              {labels?.[option.value] ?? option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

const presetOptions = ["default", "tangerine", "soft-pop", "brutalist"] as const;
type ThemePreset = (typeof presetOptions)[number];

function ThemePresetSelector({ className }: { className?: string }) {
  const [preset, setPreset] = React.useState<ThemePreset>(() => (typeof window === "undefined" ? "default" : (window.localStorage.getItem("theme-preset") as ThemePreset) || "default"));
  React.useEffect(() => {
    const root = document.documentElement;
    if (preset === "default") root.removeAttribute("data-theme-preset"); else root.dataset.themePreset = preset;
    window.localStorage.setItem("theme-preset", preset);
  }, [preset]);
  return <select aria-label="Theme preset" value={preset} onChange={(event) => setPreset(event.target.value as ThemePreset)} className={cn("h-8 rounded-md border border-border bg-background px-2 text-xs font-medium", className)}>{presetOptions.map((option) => <option key={option} value={option}>{option === "default" ? "Default" : option.replace("-", " ")}</option>)}</select>;
}

function getThemeValue(value: string | undefined): ThemeValue {
  return themeOptions.some((option) => option.value === value) ? (value as ThemeValue) : "system";
}

export { ThemePresetSelector, ThemeProvider, ThemeSelector };
