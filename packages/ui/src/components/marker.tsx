import * as React from "react";
import { cn } from "@repo/ui/lib/utils";
function Marker({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="marker"
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border",
        className,
      )}
      {...props}
    />
  );
}
function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="marker-content" className={cn("shrink-0", className)} {...props} />;
}
export { Marker, MarkerContent };
