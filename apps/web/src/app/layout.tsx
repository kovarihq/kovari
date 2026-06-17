import { type Metadata } from "next";
import { headers } from "next/headers";
import { WebAppJsonLd, OrganizationJsonLd } from "@/shared/components/seo/JsonLd";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/styles/globals.css";

import { Poppins, Inter, Manrope } from "next/font/google";
import { Toaster } from "@/shared/components/ui/sonner";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: true,
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});
import { HeroUIProvider } from "@heroui/react";
import { AuthProvider } from "@/shared/components/auth-provider";
import { ThemeProvider } from "@/shared/components/providers/theme-provider";


const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://kovari.in"),
  title: {
    default: "Kovari | Connect & Travel With the Right People",
    template: "%s | Kovari",
  },
  description: "Kovari is the social travel platform to plan trips, find travel companions, and explore the world together. Built for groups who travel differently.",
  keywords: [
    "group travel planner",
    "travel with friends",
    "plan trips with friends app",
    "travel companion finder",
    "group trip organizer",
    "social travel platform",
    "travel planning app India",
    "find travel companions India",
    "kovari",
    "kovari app"
  ],
  authors: [{ name: "Kovari", url: "https://kovari.in" }],
  creator: "Kovari",
  publisher: "Kovari",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://kovari.in",
    siteName: "Kovari",
    title: "Kovari | Connect & Travel With the Right People",
    description: "The social travel platform for people who travel in groups. Plan trips, find companions, explore together.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kovari | Connect & Travel With the Right People",
    description: "The social travel platform for people who travel in groups.",
    creator: "@kovariapp",
  },
  category: "travel",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.webp",
    shortcut: "/favicon.webp",
    apple: "/favicon.webp",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || "";
  const pathname = headersList.get("x-pathname") || "";
  const canonicalUrl = `https://kovari.in${pathname}`;

  return (
    <ClerkProvider nonce={nonce}>
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="canonical" href={canonicalUrl} />
          {process.env.NODE_ENV === "production" && (
            <script src="/scripts/disable-console.js" nonce={nonce} suppressHydrationWarning />
          )}
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `
                try {
                  var marketingRoutes = ['/', '/about', '/privacy', '/terms', '/community-guidelines', '/user-safety', '/data-deletion'];
                  var authRoutes = ['/sign-in', '/sign-up', '/forgot-password', '/sso-callback', '/verify-email', '/banned'];
                  var path = window.location.pathname.replace(/\\/$/, "") || "/";
                  
                  var isMarketing = marketingRoutes.includes(path);
                  var isAuth = authRoutes.some(function(r) { return path.indexOf(r) === 0; });
                  var isForcedLight = isMarketing || isAuth;
                  
                  var d = document.documentElement;
                  
                  if (isForcedLight) {
                    d.classList.remove('dark');
                    d.style.colorScheme = 'light';
                  } else {
                    var theme = localStorage.getItem('kovari-theme');
                    if (!theme) {
                      localStorage.setItem('kovari-theme', 'light');
                      theme = 'light';
                    }
                    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                      d.classList.add('dark');
                      d.style.colorScheme = 'dark';
                    } else {
                      d.classList.remove('dark');
                      d.style.colorScheme = 'light';
                    }
                  }
                } catch (e) {}
              `,
            }}
          />
          <link rel="preconnect" href="https://api.fontshare.com" />
          <link
            href="https://api.fontshare.com/v2/css?f[]=clash-display@200,300,400,500,600,700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body
          className={`${inter.variable} ${poppins.variable} ${manrope.variable} font-sans`}
        >
          <WebAppJsonLd />
          <OrganizationJsonLd />
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
            storageKey="kovari-theme"
            nonce={nonce}
          >
            <HeroUIProvider>
              <AuthProvider>{children}</AuthProvider>
              <Toaster
                position="bottom-right"
                duration={3000}
              />
              {/* @ts-ignore */}
              <Analytics nonce={nonce} />
              <SpeedInsights />
            </HeroUIProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

