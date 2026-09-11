import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import { Markdown } from "@repo/ui/components/markdown";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { cn } from "@repo/ui/lib/utils";
import { getInitials } from "../../../../../../lib/utils";
import { bubbleVariant, formatTimestamp, isImage, senderName } from "../../chat.utils";
import AttachmentCard from "../attachment-card";
import type { MessageAttachmentsProps, TranscriptMessageProps } from "./index.types";

export default function TranscriptMessage({
  message,
  onRetry,
  onOpenImage,
}: TranscriptMessageProps) {
  if (message.senderType === "SYSTEM") {
    return (
      <Marker>
        <MarkerContent>{message.content}</MarkerContent>
      </Marker>
    );
  }

  const isHuman = message.senderType === "HUMAN_AGENT";
  const legacyAttachmentText =
    /^I need help with the attached file: .+$/.test(message.content) && message.attachments.length;
  return (
    <Message align={isHuman ? "end" : "start"}>
      <MessageAvatar>
        <Avatar className="size-7">
          <AvatarFallback className="text-[11px] ring-1 ring-border">
            {getInitials(senderName(message))}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="text-[11px] font-medium">{senderName(message)}</MessageHeader>
        <Bubble variant={bubbleVariant(message.senderType)}>
          <BubbleContent className={message.attachments.length ? "w-fit max-w-full" : undefined}>
            {message.attachments.length ? (
              <MessageAttachments
                attachments={message.attachments}
                onOpenImage={onOpenImage}
                showReadability={message.senderType === "CUSTOMER"}
              />
            ) : null}
            {message.content && !legacyAttachmentText ? (
              <div className={message.attachments.length ? "mt-2" : undefined}>
                {message.senderType === "CUSTOMER" ? (
                  message.content
                ) : (
                  <Markdown>{message.content}</Markdown>
                )}
              </div>
            ) : null}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="flex items-center gap-1.5 text-[11px] tabular-nums">
          {formatTimestamp(message.createdAt)}
          {isHuman && ["PENDING", "FAILED"].includes(message.deliveryStatus) ? (
            <span
              className={cn(
                "text-[11px]",
                message.deliveryStatus === "FAILED" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {message.deliveryStatus === "PENDING"
                ? "Sending…"
                : `Failed to send${message.deliveryFailureReason ? `: ${message.deliveryFailureReason}` : ""}`}
            </span>
          ) : null}
          {isHuman && message.deliveryStatus === "FAILED" ? (
            <button className="text-[11px] underline" onClick={onRetry} type="button">
              Retry
            </button>
          ) : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function MessageAttachments({
  attachments,
  onOpenImage,
  showReadability = true,
}: MessageAttachmentsProps) {
  const images = attachments.filter(isImage);
  const otherAttachments = attachments.filter((attachment) => !isImage(attachment));
  const shownImages = images.slice(0, 4);
  const imageColumns = Math.min(shownImages.length, 3);
  return (
    <div className="grid w-fit max-w-sm gap-1.5">
      {images.length ? (
        <div
          className={cn(
            "grid gap-1.5",
            imageColumns === 1 ? "grid-cols-1" : imageColumns === 2 ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {shownImages.map((attachment, index) => (
            <div className="relative" key={attachment.id}>
              <AttachmentCard
                attachment={attachment}
                onOpenImage={() => onOpenImage(attachment)}
                showReadability={showReadability}
              />
              {index === 3 && images.length > 4 ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-md bg-black/60 text-sm font-semibold text-white">
                  +{images.length - 4}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {otherAttachments.map((attachment) => (
        <AttachmentCard
          attachment={attachment}
          key={attachment.id}
          onOpenImage={() => onOpenImage(attachment)}
          showReadability={showReadability}
        />
      ))}
    </div>
  );
}
