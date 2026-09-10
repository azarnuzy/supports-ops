import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { hexColorPattern } from "../../widget.utils";
import WidgetChatIcon from "../widget-chat-icon";
import type { PreviewCardProps } from "./index.types";

export default function PreviewCard({ logoUrl, botName, welcomeMessage, primaryColor }: PreviewCardProps) {
  const color = hexColorPattern.test(primaryColor) ? primaryColor : "#2563eb";

  return (
    <Card className="border-none bg-[#0b1220] text-white">
      <CardHeader>
        <CardTitle className="text-white">Preview</CardTitle>
        <CardDescription className="text-white/60">
          Mirrors how Customers will see the widget on your site.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-hidden rounded-2xl bg-white text-[#172033] shadow-lg">
          <div className="flex items-center gap-2.5 px-4 py-4" style={{ backgroundColor: color }}>
            <Avatar className="size-7 border-0 bg-white/20">
              <AvatarImage alt="" src={logoUrl ?? undefined} />
              <AvatarFallback className="bg-transparent">
                <WidgetChatIcon className="size-4 text-white" />
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-semibold text-white">
              {botName || "Support Bot"}
            </span>
          </div>
          <div className="p-4">
            <Bubble variant="ai">
              <BubbleContent>{welcomeMessage || "Hi! How can we help you today?"}</BubbleContent>
            </Bubble>
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="grid size-14 shrink-0 place-items-center rounded-full text-white shadow-lg"
            style={{ backgroundColor: color }}
          >
            <WidgetChatIcon className="size-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
