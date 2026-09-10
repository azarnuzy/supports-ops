import { Item, ItemContent, ItemMedia, ItemTitle } from "@repo/ui/components/item";
import type { DetailRowProps } from "./index.types";

export default function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  return (
    <Item size="sm" className="px-2 py-1.5">
      <ItemMedia>
        <Icon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle className="text-xs font-normal text-muted-foreground">{label}</ItemTitle>
        <p className="truncate text-sm">{value}</p>
      </ItemContent>
    </Item>
  );
}
