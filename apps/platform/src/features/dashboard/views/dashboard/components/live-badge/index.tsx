import { cn } from "@repo/ui/lib/utils";

import type { LiveBadgeProps } from "./index.types";

export default function LiveBadge({ className }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-status-resolved/30 bg-status-resolved/10 px-2.5 py-1 text-xs font-medium text-[var(--status-resolved-foreground)]",
        className,
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-resolved opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-status-resolved" />
      </span>
      Live
    </span>
  );
}
