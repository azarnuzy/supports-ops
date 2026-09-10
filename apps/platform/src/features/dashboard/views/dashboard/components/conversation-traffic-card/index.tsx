import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import HeatmapGrid from "../heatmap-grid";
import type { ConversationTrafficCardProps } from "./index.types";

export default function ConversationTrafficCard({ buckets }: ConversationTrafficCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>Conversation Traffic</CardTitle>
        <Badge variant="outline">Live</Badge>
      </CardHeader>
      <CardContent>
        <HeatmapGrid buckets={buckets} />
      </CardContent>
    </Card>
  );
}
