import type { Metadata } from "next";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/config/site";

export const INDEXABLE_ROUTES = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1.0 },
  { path: "/about", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/privacy", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/user-safety", changeFrequency: "monthly" as const, priority: 0.6 },
  {
    path: "/community-guidelines",
    changeFrequency: "monthly" as const,
    priority: 0.6,
  },
  { path: "/data-deletion", changeFrequency: "monthly" as const, priority: 0.3 },
] as const;

export const NOINDEX_ROUTE_PREFIXES = [
  "/dashboard",
  "/chat",
  "/create-group",
  "/groups",
  "/invite",
  "/notifications",
  "/onboarding",
  "/profile",
  "/requests",
  "/safety",
  "/settings",
  "/explore",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/verify-email",
  "/sso-callback",
  "/banned",
  "/api",
] as const;

type MarketingMetadataOptions = {
  title: string;
  description: string;
  path: string;
  openGraph?: Metadata["openGraph"];
};

export function createMarketingMetadata({
  title,
  description,
  path,
  openGraph,
}: MarketingMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: "website",
      ...openGraph,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export { SITE_URL, SITE_NAME, absoluteUrl };
