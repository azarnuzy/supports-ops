import { cn } from "@repo/ui/lib/utils";
import { useState } from "react";
import {
  BrowserFrame,
  WidgetLauncher,
  WidgetPanel,
  WidgetStage,
} from "../../../../components/preview-frame";
import type { PreviewCardProps } from "./index.types";

type PreviewState = "transfer" | "resolved";

/** Renders only real configured text — no invented AI reply, since there is no live model call
 * behind this preview. It shows exactly what a Customer sees at each hand-off point, staged in
 * the same widget panel as the Web Widget page so both previews read like the real chat. */
export default function PreviewCard({ handoffMessage, resolutionMessage }: PreviewCardProps) {
  const [state, setState] = useState<PreviewState>("transfer");
  const [panelOpen, setPanelOpen] = useState(true);
  const message =
    state === "transfer"
      ? handoffMessage.trim() ||
        "{humanAgentName} from our team is picking this up now — thanks for your patience."
      : resolutionMessage.trim() ||
        "I've marked this as resolved. Reply any time if it comes back.";

  return (
    <div className="grid gap-3 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Live preview</h2>
          <p className="text-[13px] text-muted-foreground">What the Customer sees</p>
        </div>
        <div
          role="tablist"
          aria-label="Preview state"
          className="inline-flex shrink-0 gap-0.5 rounded-md border bg-muted/60 p-0.5"
        >
          {(
            [
              { key: "transfer", label: "Transfer" },
              { key: "resolved", label: "Resolved" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={state === option.key}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors",
                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                state === option.key && "bg-background text-foreground shadow-sm dark:bg-input/60",
              )}
              onClick={() => setState(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <BrowserFrame domain="yourcompany.com">
        <WidgetStage onDismiss={panelOpen ? () => setPanelOpen(false) : undefined}>
          {panelOpen ? (
            <WidgetPanel color="#2563eb" name="Support" onClose={() => setPanelOpen(false)}>
              <div className="flex h-full flex-col">
                <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-4">
                  <div
                    className="ml-auto max-w-[85%] rounded-[12px_12px_3px] px-3 py-2 text-[13px] leading-relaxed text-white"
                    style={{ backgroundColor: "#2563eb" }}
                  >
                    {state === "transfer"
                      ? "Can I talk to a real person?"
                      : "Thanks, that answers my question."}
                  </div>
                  <div className="max-w-[85%] rounded-[12px_12px_12px_3px] bg-[#f1f5f9] px-3 py-2 text-[13px] leading-relaxed">
                    {message}
                  </div>
                </div>
                <div className="border-t border-[#e2e8f0] p-3">
                  <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] py-1.5 pr-1.5 pl-3.5">
                    <span className="flex-1 truncate text-[13px] text-[#94a3b8]">
                      Type your message…
                    </span>
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full text-white"
                      style={{ backgroundColor: "#2563eb" }}
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
              </div>
            </WidgetPanel>
          ) : null}
          <WidgetLauncher color="#2563eb" onClick={() => setPanelOpen(true)} />
        </WidgetStage>
      </BrowserFrame>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {state === "transfer"
          ? "Sent the moment a teammate takes over the Ticket."
          : "Sent when the agent closes a Ticket on its own."}
      </p>
    </div>
  );
}
