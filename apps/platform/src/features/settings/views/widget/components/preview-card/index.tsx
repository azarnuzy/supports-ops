import { cn } from "@repo/ui/lib/utils";
import { MonitorIcon } from "lucide-react";
import { useState } from "react";
import {
  BrowserFrame,
  WidgetLauncher,
  WidgetPanel,
  WidgetStage,
} from "../../../../components/preview-frame";
import { hexColorPattern } from "../../widget.utils";
import WidgetBotIcon from "../widget-bot-icon";
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
  const [panelOpen, setPanelOpen] = useState(true);
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

      <BrowserFrame domain={domain}>
        <WidgetStage onDismiss={panelOpen ? () => setPanelOpen(false) : undefined}>
          {panelOpen ? (
            <WidgetPanel
              color={color}
              logoUrl={logoUrl}
              name={name}
              onClose={() => setPanelOpen(false)}
            >
              {state === "welcome" ? (
                <WelcomePane color={color} welcome={welcome} />
              ) : (
                <ConversationPane color={color} welcome={welcome} />
              )}
            </WidgetPanel>
          ) : null}
          <WidgetLauncher color={color} onClick={() => setPanelOpen(true)} />
        </WidgetStage>
      </BrowserFrame>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <MonitorIcon className="mt-0.5 size-3.5 shrink-0" />
        On a real page the panel is 384px wide and sits 24px from the bottom-right corner of the
        viewport.
      </p>
    </div>
  );
}

function WelcomePane({ color, welcome }: { color: string; welcome: string }) {
  return (
    <div className="flex h-full flex-col justify-center p-4 text-center">
      <div
        className="mx-auto grid size-14 place-items-center rounded-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
          color,
        }}
      >
        <WidgetBotIcon className="size-7" />
      </div>
      <p className="mt-3 text-[19px] leading-tight font-semibold tracking-tight">Hi there! 👋</p>
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
  );
}

function ConversationPane({ color, welcome }: { color: string; welcome: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-4">
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
      </div>
      <div className="border-t border-[#e2e8f0] p-3">
        <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] py-1.5 pr-1.5 pl-3.5">
          <span className="flex-1 truncate text-[13px] text-[#94a3b8]">Type your message…</span>
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full text-white"
            style={{ backgroundColor: color }}
          >
            <svg aria-hidden="true" className="size-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="m3 11.5 18-8-8 18-2.5-7.5L3 11.5Z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
