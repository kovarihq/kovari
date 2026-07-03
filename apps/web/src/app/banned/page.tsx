import { BannedActionButtons } from "./components/BannedActionButtons";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Button } from "@/shared/components/ui/button";
import { createAdminSupabaseClient } from "@kovari/api";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Account Restricted",
  robots: { index: false, follow: false },
};

export default async function BannedPage() {
  const { userId } = await auth();

  // If not signed in, there is no meaningful "banned" state – send them away
  if (!userId) {
    redirect("/sign-in");
  }

  type BanDetails = {
    isActiveBan: boolean;
    isSuspended: boolean;
    reason: string | null;
    expiresAt: string | null;
  };

  const defaultBanDetails: BanDetails = {
    isActiveBan: false,
    isSuspended: false,
    reason: null,
    expiresAt: null,
  };

  let banDetails: BanDetails = defaultBanDetails;

  /* const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; */

  if (true) {
    const supabase = createAdminSupabaseClient();

    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("banned, ban_reason, ban_expires_at")
        .eq("clerk_user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch ban details:", error);
      }

      if (user?.banned) {
        const now = new Date();
        const expiresAt = user.ban_expires_at
          ? new Date(user.ban_expires_at)
          : null;

        const isActiveBan =
          expiresAt === null // permanent ban
            ? true
            : expiresAt > now; // suspension still active

        const isSuspended = !!expiresAt && isActiveBan;

        if (isActiveBan) {
          banDetails = {
            isActiveBan,
            isSuspended,
            reason: user.ban_reason ?? null,
            expiresAt: user.ban_expires_at ?? null,
          };
        }
      }
    } catch (error) {
      console.error("Failed to fetch ban details:", error);
    }
  }

  // If there is no active ban (permanent or suspension), do not allow access
  if (!banDetails.isActiveBan) {
    redirect("/");
  }

  const title = banDetails.isSuspended ? "Account suspended" : "Account banned";
  const message = banDetails.isSuspended
    ? "Your account is temporarily suspended due to a violation of our terms of service."
    : "Your account is permanently banned due to a violation of our terms of service.";

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-12 selection:bg-primary/20">
      {/* Background gradients for a premium feel */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/5 opacity-50 blur-[100px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Branding header */}
        <div className="flex justify-center pb-8">
          <Image
            src="/logo.webp"
            alt="Kovari"
            width={400}
            height={160}
            className="h-5 w-auto object-contain block dark:hidden"
            priority
          />
          <Image
            src="/logo_dark.webp"
            alt="Kovari"
            width={400}
            height={160}
            className="h-5 w-auto object-contain hidden dark:block"
            priority
          />
        </div>

        {/* The Card */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
          <div className="px-5 py-5 sm:py-7 sm:px-7">
            
            {/* Text Content - Minimalist & Typography focused */}
            <div className="text-center space-y-4">
              {/* <div className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-1 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                </span>
                <span className="text-xs font-medium uppercase tracking-wider text-destructive">
                  Access Restricted
                </span>
              </div>
               */}
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              
              <p className="text-[15px] leading-relaxed text-muted-foreground mx-auto max-w-[340px] pt-1 pt-2">
                {message}
              </p>
            </div>

            {/* Expiration Box (for suspensions) */}
            {banDetails.expiresAt && (
              <div className="mt-8 rounded-xl border border-border bg-secondary p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Suspension active until</span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(banDetails.expiresAt), "MMM d, yyyy, h:mm a")}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <BannedActionButtons />
          </div>
          
          {/* Footer of card */}
          <div className="border-t border-border/40 px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Review our <Link href="/community-guidelines" className="underline underline-offset-2 hover:text-foreground">Community Guidelines</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


