import { Card } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import type { DashboardCardProps } from "./index.types";

export default function DashboardCard({ className, ...props }: DashboardCardProps) {
  return (
    <Card
      className={cn(
        "gap-5 py-5 transition-[translate,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}
