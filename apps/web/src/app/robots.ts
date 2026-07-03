import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config/site";

export default function robots(): MetadataRoute.Robots {
  const isNonProduction =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview";

  if (isNonProduction) {
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
