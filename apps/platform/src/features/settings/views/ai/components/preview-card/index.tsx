import { cn } from "@repo/ui/lib/utils";
import { BotIcon, UserRoundIcon } from "lucide-react";
import { useState } from "react";
import type { PreviewCardProps } from "./index.types";

type PreviewState = "transfer" | "resolved";

/** Renders only real configured text — no invented AI reply, since there is no live model call
 * behind this preview. It shows exactly what a Customer sees at each hand-off point. */
export default function PreviewCard({ handoffMessage, resolutionMessage }: PreviewCardProps) {
  const [state, setState] = useState<PreviewState>("transfer");
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

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid gap-2 p-4">
          <div className="ml-auto flex max-w-[85%] items-start gap-2">
            <div className="rounded-[12px_12px_3px] bg-primary px-3 py-2 text-[13px] leading-relaxed text-primary-foreground">
              {state === "transfer"
                ? "Can I talk to a real person?"
                : "Thanks, that answers my question."}
            </div>
            <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
              <UserRoundIcon className="size-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="flex max-w-[85%] items-start gap-2">
            <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10">
              <BotIcon className="size-3.5 text-primary" />
            </div>
            <div className="rounded-[12px_12px_12px_3px] bg-muted px-3 py-2 text-[13px] leading-relaxed">
              {message}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {state === "transfer"
          ? "Sent the moment a teammate takes over the Ticket."
          : "Sent when the agent closes a Ticket on its own."}
      </p>
    </div>
  );
}
