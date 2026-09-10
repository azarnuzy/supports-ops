import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import HeatmapGrid from "../heatmap-grid";
import type { ResolutionsCardProps } from "./index.types";

export default function ResolutionsCard({ buckets }: ResolutionsCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>Resolutions</CardTitle>
        <Badge variant="outline">Live</Badge>
      </CardHeader>
      <CardContent>
        <HeatmapGrid buckets={buckets} />
      </CardContent>
    </Card>
  );
}
