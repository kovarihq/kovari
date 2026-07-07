import { MetadataRoute } from "next";
import { INDEXABLE_ROUTES, absoluteUrl } from "@/lib/seo";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const cleanHost = host.toLowerCase().split(":")[0];

  // If request is on the Product domain (app.kovari.in), return 404 Not Found
  if (cleanHost === "app.kovari.in" || cleanHost.startsWith("app.localhost")) {
    notFound();
  }

  const now = new Date();

  return INDEXABLE_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));
}


