import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { MoveLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  let userId: string | null = null;
  try {
    const authState = await auth();
    userId = authState?.userId || null;
  } catch (e) {
    console.warn("Clerk auth failed in not-found page:", e);
  }
  const homeUrl = userId ? "/dashboard" : "/";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 relative overflow-hidden font-sans selection:bg-primary/20">
      <div className="max-w-md w-full relative z-10 text-center">
        {/* Artistic 404 Header */}
        <div className="relative mb-4">
          <span className="text-3xl sm:text-4xl font-semibold text-foreground leading-none select-none">
            404
          </span>
        </div>

        {/* Minimal Typography */}
        <div className="space-y-4 mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            Page not found
          </h2>
          <p className="text-muted-foreground text-md sm:text-lg leading-relaxed max-w-md mx-auto font-medium">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Clean Buttons */}
        <div className="flex w-full flex-row gap-2 justify-center items-center">
          <Button
            asChild
            className="w-1/2 bg-primary hover:bg-primary-hover text-primary-foreground !px-8 h-12 rounded-full font-semibold"
          >
            <Link href={homeUrl} className="flex items-center gap-2">
              <MoveLeft className="w-4 h-4" />
              Home
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-1/2 text-foreground !px-8 h-12 rounded-full font-semibold transition-all"
          >
            <Link href="mailto:support@kovari.in">Support</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

