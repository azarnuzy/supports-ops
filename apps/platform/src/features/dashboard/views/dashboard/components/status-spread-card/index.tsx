import { CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";

import DashboardCard from "../dashboard-card";
import Donut, { type DonutSlice } from "../donut";
import type { StatusSpreadCardProps } from "./index.types";

/** Reference order: outcome first, then the handling states in lifecycle order. */
const slicesByStatus: Array<{
  key: "RESOLVED" | "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING";
  label: string;
  color: string;
}> = [
  { key: "RESOLVED", label: "Resolved", color: "var(--status-resolved)" },
  { key: "AI_HANDLING", label: "AI handling", color: "var(--status-ai)" },
  { key: "ESCALATED", label: "Escalated", color: "var(--status-escalated)" },
  { key: "HUMAN_HANDLING", label: "Human handling", color: "var(--status-human)" },
];

export default function StatusSpreadCard({ counts }: StatusSpreadCardProps) {
  const countByStatus = new Map(counts.map((entry) => [entry.status, entry.count]));
  const slices: DonutSlice[] = slicesByStatus.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    value: countByStatus.get(entry.key) ?? 0,
  }));

  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="text-sm leading-4">Ticket Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center px-3.5">
        <Donut slices={slices} />
      </CardContent>
    </DashboardCard>
  );
}
