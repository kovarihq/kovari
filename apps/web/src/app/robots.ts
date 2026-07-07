import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config/site";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const isNonProduction =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview";

  if (isNonProduction) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const cleanHost = host.toLowerCase().split(":")[0];

  // If request is on the Product domain (app.kovari.in), disallow crawling entirely
  if (cleanHost === "app.kovari.in" || cleanHost.startsWith("app.localhost")) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/sign-in",
          "/sign-up",
          "/forgot-password",
          "/verify-email",
          "/sso-callback",
          "/banned",
          "/onboarding/",
          "/settings/",
          "/admin/",
          "/explore/",
          "/chat/",
          "/profile/",
          "/groups/",
          "/invite/",
          "/notifications/",
          "/requests/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

