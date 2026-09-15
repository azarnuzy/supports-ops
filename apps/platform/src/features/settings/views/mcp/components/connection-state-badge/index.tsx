import { Badge } from "@repo/ui/components/badge";
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import type { ConnectionStateBadgeProps } from "./index.types";

const config = {
  connected: { Icon: CircleCheckIcon, label: "Connected", variant: "outline" as const },
  degraded: { Icon: CircleAlertIcon, label: "Degraded", variant: "secondary" as const },
  disconnected: { Icon: CircleXIcon, label: "Disconnected", variant: "secondary" as const },
};

export default function ConnectionStateBadge({ state }: ConnectionStateBadgeProps) {
  const { Icon, label, variant } = config[state];
  return (
    <Badge
      variant={variant}
      className={
        state === "connected"
          ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
          : state === "degraded"
            ? "border-amber-600/30 text-amber-700 dark:text-amber-400"
            : "text-muted-foreground"
      }
    >
      <Icon className="size-3.5" />
      {label}
    </Badge>
  );
}
