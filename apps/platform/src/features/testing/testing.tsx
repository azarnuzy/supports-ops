import type { EvalDatasetSummary } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { FlaskConicalIcon, PlusIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PlatformAppShell } from "../app-shell";
import ResourceListState from "../settings/components/resource-list-state";
import { SettingsHeader } from "../settings/components/settings-header";
import { CreateDatasetDrawer } from "./create-dataset-drawer";
import { DestinationForm } from "./destination-form";
import { useDatasetsQuery } from "./hooks";

function DatasetRow({ dataset }: { dataset: EvalDatasetSummary }) {
  return (
    <Link
      className="flex items-center justify-between gap-4 border-b p-4 transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      params={{ datasetId: dataset.id }}
      to="/testing/$datasetId"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{dataset.name}</span>
        <span className="text-sm text-muted-foreground">
          {dataset.caseCount} {dataset.caseCount === 1 ? "case" : "cases"}
        </span>
      </span>
      {dataset.incompleteCount > 0 ? (
        <Badge variant="outline">{dataset.incompleteCount} incomplete</Badge>
      ) : null}
    </Link>
  );
}

const TestingView = () => {
  const datasets = useDatasetsQuery();
  const [creating, setCreating] = useState(false);
  const items = datasets.data?.datasets ?? [];

  return (
    <PlatformAppShell>
      <section className="mx-auto grid w-full max-w-6xl gap-8">
        <SettingsHeader
          title="Testing"
          eyebrow="Evaluation"
          description="Write Eval Datasets to check how your AI Agent answers before you change it."
          action={
            <Button onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" /> Create Dataset
            </Button>
          }
        />
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <ResourceListState
            isPending={datasets.isPending}
            isError={datasets.isError}
            errorLabel="Unable to load Eval Datasets."
            onRetry={() => void datasets.refetch()}
            isEmpty={items.length === 0}
            emptyIcon={<FlaskConicalIcon className="size-5 text-muted-foreground" />}
            emptyTitle="No Eval Datasets yet"
            emptyDescription="Create a dataset, then add the Customer Messages you want to check."
            emptyAction={
              <Button size="sm" onClick={() => setCreating(true)}>
                Create Dataset
              </Button>
            }
          />
          {items.map((dataset) => (
            <DatasetRow key={dataset.id} dataset={dataset} />
          ))}
        </div>
        <DestinationForm />
      </section>
      <CreateDatasetDrawer open={creating} onOpenChange={setCreating} />
    </PlatformAppShell>
  );
};

export default TestingView;
