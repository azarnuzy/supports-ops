import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@repo/ui/lib/utils";

const bubbleVariants = cva("group/bubble flex w-fit max-w-[80%] flex-col gap-1 self-start", {
  variants: { variant: { customer: "", ai: "", human: "self-end", error: "" } },
  defaultVariants: { variant: "customer" },
});
function Bubble({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bubbleVariants>) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  );
}
function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        "rounded-xl border px-3 py-2 text-sm leading-relaxed wrap-break-word group-data-[variant=customer]/bubble:bg-bubble-customer group-data-[variant=customer]/bubble:text-foreground group-data-[variant=customer]/bubble:border-border group-data-[variant=ai]/bubble:bg-bubble-ai group-data-[variant=ai]/bubble:border-bubble-ai-border group-data-[variant=ai]/bubble:text-foreground group-data-[variant=human]/bubble:bg-bubble-agent group-data-[variant=human]/bubble:border-bubble-agent-border group-data-[variant=human]/bubble:text-foreground group-data-[variant=error]/bubble:bg-destructive/10 group-data-[variant=error]/bubble:border-destructive/30 group-data-[variant=error]/bubble:text-destructive",
        className,
      )}
      {...props}
    />
  );
}
function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="bubble-group" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}
export { Bubble, BubbleContent, BubbleGroup, bubbleVariants };
