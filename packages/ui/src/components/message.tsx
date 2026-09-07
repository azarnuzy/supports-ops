import * as React from "react";
import { cn } from "@repo/ui/lib/utils";
function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn("group/message flex w-full gap-2 data-[align=end]:flex-row-reverse", className)}
      {...props}
    />
  );
}
function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="message-avatar" className={cn("mt-auto shrink-0", className)} {...props} />
  );
}
function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 group-data-[align=end]/message:items-end",
        className,
      )}
      {...props}
    />
  );
}
function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn("px-3 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn("px-3 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
export { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader };
