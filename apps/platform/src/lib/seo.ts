const SITE_NAME = "SupportOps";
const siteUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "");

type PageMetadata = {
  description: string;
  path: string;
  title: string;
  noIndex?: boolean;
};

export function pageMetadata({ title, description, path, noIndex = false }: PageMetadata) {
  const canonical = siteUrl ? `${siteUrl}${path}` : undefined;
  const fullTitle = `${title} | ${SITE_NAME}`;

  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { name: "robots", content: noIndex ? "noindex, nofollow" : "index, follow" },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${siteUrl ?? ""}/og-image.png` },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: `${siteUrl ?? ""}/og-image.png` },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}
