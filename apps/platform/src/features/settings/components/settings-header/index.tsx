import type { SettingsHeaderProps } from "./index.types";

export function SettingsHeader({ action, description, eyebrow, title }: SettingsHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
