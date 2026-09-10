import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { formatRate } from "../../dashboard.utils";
import type { RateCardProps } from "./index.types";

export default function RateCard({ title, description, figure, totalTickets }: RateCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{formatRate(figure.rate)}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {totalTickets === 0
          ? "No Tickets yet."
          : `${figure.count} of ${totalTickets} Tickets. ${description}`}
      </CardContent>
    </Card>
  );
}
