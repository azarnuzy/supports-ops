import { Card } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import type { DashboardCardProps } from "./index.types";

export default function DashboardCard({ className, ...props }: DashboardCardProps) {
  return <Card className={cn("h-full min-w-0 gap-5 overflow-hidden py-5 shadow-sm", className)} {...props} />;
}
