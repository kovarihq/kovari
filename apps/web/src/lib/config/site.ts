/**
 * Canonical production origin and brand constants.
 * All public-facing absolute URLs must derive from here — never from request host.
 */
export const SITE_URL = "https://kovari.in" as const;
export const SITE_HOST = "kovari.in" as const;
export const SITE_NAME = "Kovari" as const;

export const SUPPORT_EMAIL = "support@kovari.in" as const;
export const HELLO_EMAIL = "hello@kovari.in" as const;

export const SOCIAL_LINKS = {
  instagram: "https://instagram.com/kovari.app",
  twitter: "https://x.com/kovariapp",
  linkedin: "https://linkedin.com/company/kovariapp",
} as const;

/** Primary logo served from /public */
export const SITE_LOGO_PATH = "/logo.webp" as const;
export const SITE_LOGO_URL = `${SITE_URL}${SITE_LOGO_PATH}` as const;

/** Fallback when webp logo is unavailable (e.g. OG image generation) */
export const SITE_LOGO_FALLBACK_PATH = "/logo_dark.webp" as const;

export function absoluteUrl(path: string = "/"): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Production app URL for emails and deep links — always kovari.in in prod. */
export function getProductionAppUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
  return SITE_URL;
}
