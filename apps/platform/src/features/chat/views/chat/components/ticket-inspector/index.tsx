import { Empty, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { CalendarIcon, FlagIcon, HistoryIcon, MailIcon, UserRoundIcon } from "lucide-react";
import type { DetailsTab } from "../../chat.types";
import AttachmentCard from "../attachment-card";
import DetailRow from "../detail-row";
import type { TicketInspectorProps } from "./index.types";

export default function TicketInspector({
  detail,
  detailsTab,
  images,
  setDetailsTab,
  setGalleryIndex,
  timeline,
}: TicketInspectorProps) {
  return (
    <Tabs
      value={detailsTab}
      onValueChange={(value) => setDetailsTab(value as DetailsTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList className="mx-3 mt-3 w-[calc(100%-1.5rem)]">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="attachments">Attachments</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      {detailsTab === "details" ? (
        <div className="flex flex-col gap-1 p-3">
          <DetailRow icon={MailIcon} label="Email" value={detail.customerIdentity.email} />
          <DetailRow
            icon={UserRoundIcon}
            label="Owner"
            value={detail.assignedHumanAgent?.name ?? "Unassigned"}
          />
          <DetailRow icon={FlagIcon} label="Priority" value={detail.priority} />
          <DetailRow icon={CalendarIcon} label="Category" value={detail.category} />
          {detail.escalationReason ? (
            <DetailRow icon={FlagIcon} label="Escalation reason" value={detail.escalationReason} />
          ) : null}
          {detail.escalationSummaryStatus === "PENDING" ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Preparing the Escalation Summary…
            </p>
          ) : null}
          {detail.escalationSummaryStatus === "FAILED" ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              The Escalation Summary could not be generated.
            </p>
          ) : null}
          {detail.escalationSummaryStatus === "READY" && detail.escalationSummary ? (
            <article className="mx-2 mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
              {detail.escalationSummary}
            </article>
          ) : null}
          {detail.status === "RESOLVED" ? (
            <>
              <DetailRow
                icon={FlagIcon}
                label="Resolution reason"
                value={detail.resolutionReason ?? "—"}
              />
              <DetailRow
                icon={CalendarIcon}
                label="Resolved at"
                value={detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString() : "—"}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {detailsTab === "attachments" ? (
        <div className="grid gap-2 p-3">
          {detail.messages.flatMap((message) => message.attachments).length ? (
            detail.messages.flatMap((message) =>
              message.attachments.map((attachment) => (
                <AttachmentCard
                  attachment={attachment}
                  key={attachment.id}
                  onOpenImage={() =>
                    setGalleryIndex(images.findIndex((image) => image.attachment.id === attachment.id))
                  }
                />
              )),
            )
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground">No Attachments yet.</p>
          )}
        </div>
      ) : null}
      {detailsTab === "activity" ? (
        timeline.length === 0 ? (
          <Empty className="border-0 p-6">
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
          </Empty>
        ) : (
          <ol className="grid gap-3 p-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <span>
                  {entry.description.text}
                  {entry.description.mono ? (
                    <>
                      {" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        {entry.description.mono}
                      </code>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Tabs>
  );
}
