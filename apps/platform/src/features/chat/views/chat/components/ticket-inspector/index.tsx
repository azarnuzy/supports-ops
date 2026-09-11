import { Empty, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  CalendarIcon,
  FlagIcon,
  HistoryIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatEnumLabel } from "../../../../../../lib/utils";
import { formatTimestamp } from "../../chat.utils";
import type { DetailsTab } from "../../chat.types";
import AttachmentCard from "../attachment-card";
import DetailRow from "../detail-row";
import { Markdown } from "@repo/ui/components/markdown";
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
        <div className="flex flex-col p-3">
          <SectionLabel>Customer</SectionLabel>
          <DetailRow
            icon={MessageCircleIcon}
            label="Channel"
            value={detail.channel.type === "WHATSAPP" ? "WhatsApp" : detail.channel.name}
          />
          {detail.customerIdentity.email ? (
            <DetailRow icon={MailIcon} label="Email" value={detail.customerIdentity.email} />
          ) : null}
          {detail.customerIdentity.phoneE164 ? (
            <DetailRow icon={PhoneIcon} label="Phone" value={detail.customerIdentity.phoneE164} />
          ) : null}
          <DetailRow
            icon={UserRoundIcon}
            label="Owner"
            value={detail.assignedHumanAgent?.name ?? "Unassigned"}
          />
          <SectionLabel>Classification</SectionLabel>
          <DetailRow icon={FlagIcon} label="Priority" value={formatEnumLabel(detail.priority)} />
          <DetailRow
            icon={CalendarIcon}
            label="Category"
            value={formatEnumLabel(detail.category)}
          />
          {detail.escalationReason ? (
            <DetailRow
              icon={FlagIcon}
              label="Escalation reason"
              value={formatEnumLabel(detail.escalationReason)}
            />
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
            <article className="mt-2 rounded-lg bg-muted p-3 text-[13px] leading-relaxed">
              <Markdown>{detail.escalationSummary}</Markdown>
            </article>
          ) : null}
          {detail.status === "RESOLVED" ? (
            <>
              <SectionLabel>Resolution</SectionLabel>
              <DetailRow
                icon={FlagIcon}
                label="Resolution reason"
                value={detail.resolutionReason ? formatEnumLabel(detail.resolutionReason) : "—"}
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
                    setGalleryIndex(
                      images.findIndex((image) => image.attachment.id === attachment.id),
                    )
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
          <ol className="grid gap-2.5 p-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2.5 text-[13px]">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {formatTimestamp(entry.createdAt)}
                </span>
                <span className="min-w-0">
                  {entry.description.text}
                  {entry.description.mono ? (
                    <>
                      {" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
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

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-3 pb-1 text-xs font-semibold text-foreground">{children}</p>;
}
