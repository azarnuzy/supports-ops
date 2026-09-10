import { Card } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import type { DashboardCardProps } from "./index.types";

export default function DashboardCard({ className, ...props }: DashboardCardProps) {
  return (
    <Card
      className={cn(
        "h-full gap-5 py-5 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
