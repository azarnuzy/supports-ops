import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { BotIcon } from "lucide-react";
import type { MessageSampleProps } from "./index.types";

export default function MessageSample({ kind, name, text }: MessageSampleProps) {
  const human = kind === "human";
  return (
    <Message align={human ? "end" : "start"}>
      <MessageAvatar>
        {kind === "ai" ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-status-ai/15 text-status-ai">
            <BotIcon className="size-4" />
          </span>
        ) : (
          <Avatar className="size-8">
            <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
          </Avatar>
        )}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{name}</MessageHeader>
        <Bubble variant={kind}>
          <BubbleContent>
            {text}
            {kind === "ai" ? (
              <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-status-ai" />
            ) : null}
          </BubbleContent>
        </Bubble>
        <MessageFooter>{kind === "error" ? "Failed to deliver" : "10:28 AM"}</MessageFooter>
      </MessageContent>
    </Message>
  );
}
