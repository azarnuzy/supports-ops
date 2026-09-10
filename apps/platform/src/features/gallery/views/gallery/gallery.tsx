import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { PlatformAppShell } from "../../../app-shell";
import { AttachmentStateSample, MessageSample } from "./components";

const GalleryView = () => {
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
              <AttachmentStateSample state="done" label="invoice.pdf" detail="182 KB" />
              <AttachmentStateSample
                state="processing"
                label="screenshot.png"
                detail="Processing…"
              />
              <AttachmentStateSample state="error" label="recording.mp3" detail="Delivery failed" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sender types and delivery states</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <MessageSample
              kind="customer"
              name="Customer"
              text="I need help with my subscription."
            />
            <MessageSample
              kind="ai"
              name="SupportOps AI"
              text="I found the relevant policy and am preparing a response."
            />
            <MessageSample
              kind="human"
              name="Human Agent"
              text="I’ve taken over and will follow up shortly."
            />
            <Marker>
              <MarkerContent>System notice: Human Agent claimed this Ticket</MarkerContent>
            </Marker>
            <MessageSample
              kind="error"
              name="Human Agent"
              text="Message could not be delivered. Retry when the Customer reconnects."
            />
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default GalleryView;
