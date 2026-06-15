"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { usePathname } from "next/navigation";

const MARKETING_ROUTES = [
  "/",
  "/about",
  "/privacy",
  "/terms",
  "/community-guidelines",
  "/user-safety",
  "/data-deletion"
];

const AUTH_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/sso-callback",
  "/verify-email",
  "/banned"
];

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isMarketing = MARKETING_ROUTES.includes(normalizedPath);
  const isAuth = AUTH_ROUTES.some((route) => normalizedPath.startsWith(route));
  const isForcedLight = isMarketing || isAuth;

  return (
    <NextThemesProvider 
      {...props} 
      forcedTheme={isForcedLight ? "light" : undefined}
    >
      {children}
    </NextThemesProvider>
  );
}
