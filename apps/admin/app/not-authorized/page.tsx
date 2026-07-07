'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';

function SignOutButtonOrPlaceholder() {
  const [loading, setLoading] = useState(false);
  try {
    const clerk = useClerk();
    
    const handleSignOut = async () => {
      setLoading(true);
      try {
        await clerk.signOut();
      } catch (err) {
        console.error("Clerk signOut failed, attempting manual cookie clear:", err);
      }
      
      // Manual cookie clearing fallback
      try {
        document.cookie.split(";").forEach((c) => {
          const cookieName = c.trim().split("=")[0];
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.kovari.in`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        });
      } catch (cookieErr) {
        console.error("Manual cookie clear failed:", cookieErr);
      }
      
      window.location.href = "/sign-in";
    };

    if (clerk) {
      return (
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:cursor-pointer disabled:opacity-50"
        >
          {loading ? "Signing out..." : "Sign out"}
        </button>
      );
    }
  } catch {
    // ClerkProvider not available (e.g., during build)
  }
  // Fallback placeholder
  return (
    <button
      disabled
      className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-muted px-4 text-sm font-medium text-muted-foreground"
    >
      Sign out
    </button>
  );
}


export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md space-y-3 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Access denied
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account is not on the admin allowlist. Please contact an
          administrator for access.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <SignOutButtonOrPlaceholder />
        </div>
      </div>
    </main>
  );
}
