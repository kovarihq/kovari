import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { AdminLayoutWrapper } from '@/components/AdminLayoutWrapper';
import { Toaster } from '@/components/ui/sonner';
import { SpeedInsights } from '@vercel/speed-insights/next';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['200', '300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://admin.kovari.in'),
  title: 'Kovari Admin',
  description: 'Internal admin dashboard for Kovari',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const isDummyKey = publishableKey?.includes(
    '51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
  );
  const shouldUseClerk = !isBuild || !isDummyKey;

  return (
    <html lang="en">
      <body
        className={`${manrope.variable} font-sans antialiased`}
      >
        {shouldUseClerk && publishableKey ? (
          <ClerkProvider>
            <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
          </ClerkProvider>
        ) : (
          children
        )}
        <Toaster />
        <SpeedInsights />
      </body>
    </html>
  );
}
