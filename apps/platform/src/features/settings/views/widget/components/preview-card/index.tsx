import { cn } from "@repo/ui/lib/utils";
import { LockIcon, MonitorIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { hexColorPattern } from "../../widget.utils";
import WidgetBotIcon from "../widget-bot-icon";
import WidgetChatIcon from "../widget-chat-icon";
import type { PreviewCardProps } from "./index.types";

type PreviewState = "welcome" | "conversation";

/** The widget itself always renders light on the Customer's site, so the panel keeps its own
 * palette regardless of the dashboard theme; only the simulated browser chrome follows it. */
export default function PreviewCard({
  allowedDomains,
  botName,
  logoUrl,
  primaryColor,
  welcomeMessage,
}: PreviewCardProps) {
  const [state, setState] = useState<PreviewState>("welcome");
  const color = hexColorPattern.test(primaryColor) ? primaryColor : "#2563eb";
  const domain = allowedDomains[0] ?? "yourcompany.com";
  const name = botName.trim() || "Support";
  const welcome = welcomeMessage.trim() || "Ask us anything — we usually reply in a few minutes.";

  return (
    <div className="grid gap-3 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Live preview</h2>
          <p className="text-[13px] text-muted-foreground">Bottom-right of {domain}</p>
        </div>
        <div
          role="tablist"
          aria-label="Preview state"
          className="inline-flex shrink-0 gap-0.5 rounded-md border bg-muted/60 p-0.5"
        >
          {(["welcome", "conversation"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={state === option}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground outline-none transition-colors",
                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                state === option && "bg-background text-foreground shadow-sm dark:bg-input/60",
              )}
              onClick={() => setState(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Simulated browser window */}
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

        {/* Faux page content behind the widget */}
        <div className="relative isolate bg-background">
          <div aria-hidden="true" className="grid gap-3 p-5 pb-6 select-none">
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
          </div>

          {/* The widget, anchored the way apps/widget anchors it: right 24px / bottom 24px */}
          <div className="flex flex-col items-end gap-3 px-6 pt-2 pb-6 font-sans text-[#172033]">
            {/* 336x542 is the real 384x620 panel at 88%, so the preview keeps the widget's
                proportions and its height no longer changes with the state below. */}
            <div className="flex h-[542px] w-full max-w-[336px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_20px_55px_rgb(15_23_42/24%)]">
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
                <XIcon className="size-4 shrink-0 text-white/80" />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
              {state === "welcome" ? (
                <div className="p-4 text-center">
                  <div
                    className="mx-auto grid size-14 place-items-center rounded-full"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
                      color,
                    }}
                  >
                    <WidgetBotIcon className="size-7" />
                  </div>
                  <p className="mt-3 text-[19px] leading-tight font-semibold tracking-tight">
                    Hi there! 👋
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">{welcome}</p>
                  <div className="mt-4 grid gap-2 text-left">
                    <div className="rounded-[10px] border border-[#cbd5e1] px-3 py-2.5 text-[13px] text-[#94a3b8]">
                      Your name
                    </div>
                    <div className="rounded-[10px] border border-[#cbd5e1] px-3 py-2.5 text-[13px] text-[#94a3b8]">
                      you@company.com
                    </div>
                    <div
                      className="mt-0.5 rounded-[10px] py-2.5 text-center text-[13px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      Start chat
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 p-4">
                  <div className="max-w-[85%] rounded-[12px_12px_12px_3px] bg-[#f1f5f9] px-3 py-2 text-[13px] leading-relaxed">
                    {welcome}
                  </div>
                  <div
                    className="ml-auto max-w-[85%] rounded-[12px_12px_3px] px-3 py-2 text-[13px] leading-relaxed text-white"
                    style={{ backgroundColor: color }}
                  >
                    My last invoice looks wrong — can you check it?
                  </div>
                  <div className="max-w-[85%] rounded-[12px_12px_12px_3px] bg-[#f1f5f9] px-3 py-2 text-[13px] leading-relaxed">
                    Of course. I've pulled up invoice #4821 — let me take a look.
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-full border border-[#cbd5e1] py-1.5 pr-1.5 pl-3.5">
                    <span className="flex-1 truncate text-[13px] text-[#94a3b8]">
                      Type your message…
                    </span>
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full text-white"
                      style={{ backgroundColor: color }}
                    >
                      <svg
                        aria-hidden="true"
                        className="size-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="m3 11.5 18-8-8 18-2.5-7.5L3 11.5Z" />
                      </svg>
                    </span>
                  </div>
                </div>
              )}
              </div>
            </div>

            <div
              className="grid size-12 shrink-0 place-items-center rounded-full text-white shadow-[0_12px_30px_rgb(0_0_0/25%)]"
              style={{ backgroundColor: color }}
            >
              <WidgetChatIcon className="size-6" />
            </div>
          </div>
        </div>
      </div>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <MonitorIcon className="mt-0.5 size-3.5 shrink-0" />
        Shown at 88% of actual size. On a real page the panel is 384px wide and sits 24px from the
        bottom-right corner.
      </p>
    </div>
  );
}
