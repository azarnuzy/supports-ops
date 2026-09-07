import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../features/auth";
import { GalleryView } from "../features/gallery";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/gallery")({
  head: () =>
    pageMetadata({
      title: "Component gallery",
      description: "SupportOps interface foundation and component states.",
      path: "/gallery",
      noIndex: true,
    }),
  beforeLoad: requireAuth,
  component: GalleryView,
});
