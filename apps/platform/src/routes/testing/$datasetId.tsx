import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { DatasetDetailView } from "../../features/testing";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/testing/$datasetId")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Eval Dataset",
      description: "Author the cases in an Eval Dataset.",
      path: "/testing",
      noIndex: true,
    }),
  component: function DatasetRoute() {
    const { datasetId } = Route.useParams();
    return <DatasetDetailView datasetId={datasetId} />;
  },
});
