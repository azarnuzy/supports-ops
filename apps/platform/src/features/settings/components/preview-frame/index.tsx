import { cn } from "@repo/ui/lib/utils";
import { LockIcon, XIcon } from "lucide-react";
import WidgetBotIcon from "../../views/widget/components/widget-bot-icon";
import WidgetChatIcon from "../../views/widget/components/widget-chat-icon";
import type {
  BrowserFrameProps,
  WidgetLauncherProps,
  WidgetPanelProps,
  WidgetStageProps,
} from "./index.types";

/** Simulated browser window: traffic-light chrome plus the Customer's URL. Both the Web Widget and
 * AI Agent pages stage their previews inside it, so the two can never drift apart visually. */
export function BrowserFrame({ children, domain }: BrowserFrameProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b bg-muted/50 px-3 py-2.5">
        <div className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2 py-1">
          <LockIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            https://{domain}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Faux Customer page on a fixed viewport-sized stage; the previewed widget anchors to its
 * bottom-right the way apps/widget anchors it (24px inset). Fixed stage heights keep the whole
 * browser window inside the dashboard viewport instead of spilling below the fold. */
export function WidgetStage({ children, onDismiss }: WidgetStageProps) {
  return (
    <div className="relative h-[440px] bg-background font-sans text-[#172033] sm:h-[520px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid gap-3 p-5 pb-6 select-none"
      >
        <div className="flex items-center gap-2">
          <div className="size-5 rounded bg-muted-foreground/20" />
          <div className="h-2 w-16 rounded-full bg-muted-foreground/20" />
          <div className="ml-auto flex gap-2">
            <div className="h-2 w-8 rounded-full bg-muted-foreground/15" />
            <div className="h-2 w-8 rounded-full bg-muted-foreground/15" />
          </div>
        </div>
        <div className="mt-3 h-4 w-3/5 rounded-full bg-muted-foreground/20" />
        <div className="h-2.5 w-full rounded-full bg-muted-foreground/12" />
        <div className="h-2.5 w-4/5 rounded-full bg-muted-foreground/12" />
        <div className="mt-1 h-16 rounded-lg bg-muted-foreground/10" />
        <div className="h-2.5 w-full rounded-full bg-muted-foreground/12" />
        <div className="h-2.5 w-11/12 rounded-full bg-muted-foreground/12" />
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: decorative preview stage, not real UI */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the panel itself has a real close button */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-end justify-end gap-3 px-4 pt-4 pb-4 sm:px-6 sm:pt-6 sm:pb-6",
          onDismiss && "cursor-pointer",
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) onDismiss?.();
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The chat panel shell Customers actually chat in — 336px wide, the real 384px panel at 88%.
 * The body flexes so each state can pin its own bottom bar. */
export function WidgetPanel({ children, color, logoUrl, name, onClose }: WidgetPanelProps) {
  return (
    <div className="flex max-h-[400px] min-h-[340px] w-full min-w-0 max-w-[336px] flex-1 flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_20px_55px_rgb(15_23_42/24%)]">
      <div
        className="flex items-center justify-between gap-3 px-4 py-3.5 text-white"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 78%, #7c3aed))`,
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white/20">
            {logoUrl ? (
              <img alt="" className="size-full object-cover" src={logoUrl} />
            ) : (
              <WidgetBotIcon className="size-5 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] leading-tight font-bold">{name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-white/85">
              <span className="size-[6px] rounded-full bg-[#4ade80]" />
              Online
            </p>
          </div>
        </div>
        <button
          aria-label="Close panel"
          className="rounded p-0.5 text-white/80 transition-colors hover:text-white"
          type="button"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** The round launcher bubble under the panel; clicking it reopens the closed panel. */
export function WidgetLauncher({ color, onClick }: WidgetLauncherProps) {
  return (
    <button
      aria-label="Open chat panel"
      className="grid size-12 shrink-0 place-items-center rounded-full text-white shadow-[0_12px_30px_rgb(0_0_0/25%)] transition-transform hover:scale-105"
      style={{ backgroundColor: color }}
      type="button"
      onClick={onClick}
    >
      <WidgetChatIcon className="size-6" />
    </button>
  );
}
