import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BotIcon } from "lucide-react";
import { PlatformAppShell } from "../modules/app-shell/app-shell";
import { meQueryOptions, UnauthorizedError } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/gallery")({
  head: () =>
    pageMetadata({
      title: "Component gallery",
      description: "SupportOps interface foundation and component states.",
      path: "/gallery",
      noIndex: true,
    }),
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
      throw error;
    }
  },
  component: GalleryPage,
});
function GalleryPage() {
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Foundation</p>
          <h1 className="text-2xl font-semibold">Component gallery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the theme and preset controls above to inspect both colour modes.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Status and priority</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <StatusBadge status="AI_HANDLING" />
              <StatusBadge status="ESCALATED" />
              <StatusBadge status="HUMAN_HANDLING" />
              <StatusBadge status="RESOLVED" />
              <PriorityBadge priority="LOW" />
              <PriorityBadge priority="NORMAL" />
              <PriorityBadge priority="HIGH" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Attachment states</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <File state="done" label="invoice.pdf" detail="182 KB" />
              <File state="processing" label="screenshot.png" detail="Processing…" />
              <File state="error" label="recording.mp3" detail="Delivery failed" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sender types and delivery states</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Sample kind="customer" name="Customer" text="I need help with my subscription." />
            <Sample
              kind="ai"
              name="SupportOps AI"
              text="I found the relevant policy and am preparing a response."
            />
            <Sample
              kind="human"
              name="Human Agent"
              text="I’ve taken over and will follow up shortly."
            />
            <Marker>
              <MarkerContent>System notice: Human Agent claimed this Ticket</MarkerContent>
            </Marker>
            <Sample
              kind="error"
              name="Human Agent"
              text="Message could not be delivered. Retry when the Customer reconnects."
            />
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
}
function File({
  state,
  label,
  detail,
}: {
  state: "done" | "processing" | "error";
  label: string;
  detail: string;
}) {
  return (
    <Attachment state={state}>
      <AttachmentMedia />
      <AttachmentContent>
        <AttachmentTitle>{label}</AttachmentTitle>
        <AttachmentDescription>{detail}</AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  );
}
function Sample({
  kind,
  name,
  text,
}: {
  kind: "customer" | "ai" | "human" | "error";
  name: string;
  text: string;
}) {
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
