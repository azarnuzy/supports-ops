import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { PlatformAppShell } from "../../../app-shell";

const MyTicketsView = () => {
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Human Agent workspace</p>
          <h1 className="text-3xl font-semibold text-balance">My tickets</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Assigned tickets</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tickets you claim will appear here.
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default MyTicketsView;
