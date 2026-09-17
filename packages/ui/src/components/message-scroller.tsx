import * as React from "react";
import { cn } from "@repo/ui/lib/utils";
function MessageScroller({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-scroller"
      className={cn("min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto", className)}
      {...props}
    />
  );
}
function MessageScrollerContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-scroller-content"
      className={cn("flex min-h-full min-w-0 w-full flex-col gap-5 p-4", className)}
      {...props}
    />
  );
}
export { MessageScroller, MessageScrollerContent };
