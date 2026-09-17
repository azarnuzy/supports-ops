import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { Empty, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
  HistoryIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  UserRoundIcon,
} from "lucide-react";
import { whatsAppCustomerServiceWindowClosesAt } from "@repo/channels";
import type { ReactNode } from "react";
import { formatEnumLabel } from "../../../../../../lib/utils";
import { formatActivityDay, formatActivityTime, formatTimestamp } from "../../chat.utils";
import type { DetailsTab, TimelineEntry } from "../../chat.types";
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
      className="min-h-0 min-w-0 flex-1 gap-0 overflow-x-hidden overflow-y-auto"
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
          {detail.channel.type === "WHATSAPP" && detail.session.customerLastMessageAt ? (
            <DetailRow
              icon={ClockIcon}
              label="Service window closes"
              value={whatsAppCustomerServiceWindowClosesAt(
                new Date(detail.session.customerLastMessageAt),
              ).toLocaleString()}
            />
          ) : null}
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
          <ol className="grid min-w-0 gap-5 p-3">
            {groupByDay(timeline).map((group) => (
              <li className="grid min-w-0 gap-2" key={group.day}>
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {formatActivityDay(group.entries[0].createdAt)}
                </p>
                <ol className="grid min-w-0 gap-2.5">
                  {group.entries.map((entry) => (
                    <li
                      className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2.5 text-[13px]"
                      key={entry.id}
                    >
                      <time
                        className="pt-0.5 text-right text-[11px] text-muted-foreground tabular-nums"
                        dateTime={entry.createdAt}
                        title={formatTimestamp(entry.createdAt)}
                      >
                        {formatActivityTime(entry.createdAt)}
                      </time>
                      <div className="grid min-w-0 gap-1">
                        <p className="min-w-0 leading-5">
                          {entry.description.text}
                          {entry.description.mono ? (
                            <>
                              {" "}
                              <code className="inline-block max-w-full rounded bg-muted px-1 py-0.5 align-middle font-mono text-[11px] break-words">
                                {breakableName(entry.description.mono)}
                              </code>
                            </>
                          ) : null}
                        </p>
                        {entry.description.meta ? (
                          <p className="text-[11px] text-muted-foreground">
                            {entry.description.meta}
                          </p>
                        ) : null}
                        {entry.description.error ? (
                          <p className="text-[11px] break-words text-destructive">
                            {entry.description.error}
                          </p>
                        ) : null}
                        {(
                          [
                            ["Input", entry.description.input],
                            ["Output", entry.description.output],
                          ] as const
                        ).map(([label, value]) =>
                          value ? (
                            <Collapsible className="group/tool-payload min-w-0" key={label}>
                              <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                                <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/tool-payload:rotate-90" />
                                {label}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="min-w-0 max-w-full">
                                <pre className="mt-1 max-h-64 w-full max-w-full overflow-auto overscroll-contain rounded bg-muted p-2 font-mono text-[11px] break-words whitespace-pre-wrap">
                                  {value}
                                </pre>
                              </CollapsibleContent>
                            </Collapsible>
                          ) : null,
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Tabs>
  );
}

/** Zero-width break opportunities after `_` runs and lower→upper boundaries, so
 * long namespaced Tool names wrap at separators instead of being cut off. */
function breakableName(name: string) {
  return name.replace(/(_+)|(?<=[a-z0-9])(?=[A-Z])/g, (separator) => `${separator}\u200b`);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-3 pb-1 text-xs font-semibold text-foreground">{children}</p>;
}

/** Buckets the ordered timeline by calendar day for the Activity day labels. */
function groupByDay(timeline: TimelineEntry[]) {
  const groups: { day: string; entries: TimelineEntry[] }[] = [];
  for (const entry of timeline) {
    const day = new Date(entry.createdAt).toDateString();
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}
