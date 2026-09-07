import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { PlatformAppShell } from "../../../app-shell";

const KnowledgeView = () => {
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Workspace knowledge</p>
          <h1 className="text-3xl font-semibold text-balance">Knowledge Sources</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Sources</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Knowledge Source management will appear here.
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
};

export default KnowledgeView;
