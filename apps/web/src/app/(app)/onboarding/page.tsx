"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncUserToSupabase } from "@kovari/api/client";
import ProfileSetupForm from "@/features/onboarding/components/ProfileSetupForm";
import { useAuth, useUser } from "@clerk/nextjs";
import { AlertCircle, LogOut, Compass, Mail, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function ProfileSetupPage() {
  const { syncUser } = useSyncUserToSupabase();
  const { signOut } = useAuth();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const hasCheckedRef = useRef(false);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isGoingHome, setIsGoingHome] = useState(false);
  
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const check = async () => {
      try {
        const synced = await syncUser();
        if (!synced) {
          setDenied(true);
          setChecking(false);
          return;
        }
        const res = await fetch("/api/profile/current", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.onboardingCompleted === true) {
            router.replace("/dashboard");
          } else {
            setChecking(false);
          }
        } else {
          setChecking(false);
        }
      } catch (err: any) {
        console.error("Verification failed:", err);
        setDenied(true);
        setChecking(false);
      }
    };

    void check();
  }, [syncUser, router]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch {
      window.location.href = "/sign-in";
    }
  };

  const handleGoHome = async () => {
    setIsGoingHome(true);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      window.location.href = "/";
    }
  };

  if (checking || !isLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Decorative Background Gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-primary/10 blur-[80px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[250px] h-[250px] rounded-full bg-accent/5 blur-[60px]" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md mx-auto">
          {/* Pulsing Loading Spinner */}
          <div className="relative mb-6">
            <div className="w-12 h-12 rounded-full border-5 border-primary/20 border-t-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold font-heading text-foreground mb-2 animate-pulse">
            Verifying Beta Access...
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed font-sans">
            Please wait while we check your waitlist invitation status.
          </p>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Decorative Background Gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-destructive/10 blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-primary/5 blur-[80px]" />

        <div className="relative z-10 w-full bg-card max-w-lg mx-auto">
          <div className="backdrop-blur-md bg-card border border-border/80 shadow-none rounded-2xl p-8 flex flex-col items-center text-center">
            {/* Warning Icon Badge */}
            {/* <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-6 border border-destructive/25 text-destructive shadow-xs">
              <AlertCircle className="w-7 h-7" />
            </div> */}

            {/* Title */}
            <h1 className="text-2xl font-semibold font-heading text-foreground tracking-tight mb-3">
              Access Restricted
            </h1>

            {/* Subtitle / Explanation */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 font-sans">
              Kovari is currently in a <strong>closed beta phase</strong>. 
              The account you signed in with does not have an active invitation.
            </p>

            {/* Logged in email info panel */}
            {user && (
              <div className="w-full border border-border rounded-xl px-4 py-3 mb-6 flex items-start gap-3 text-left">
                <Mail className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-heading">
                    Signed in as
                  </p>
                  <p className="text-sm font-medium text-foreground truncate font-sans">
                    {user.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>
            )}

            {/* Warning Info Box */}
            <div className="text-sm text-muted-foreground rounded-xl p-4 border border-border text-left space-y-4 mb-8 font-sans">
              <p>
                <strong>Are you a beta user?</strong> If yes, please sign out and sign in using the exact email address where you received your beta invite.
              </p>
              <p>
                <strong>Not on the waitlist?</strong> Head back to our homepage to request access or join the waitlist.
              </p>
            </div>

            {/* Actions */}
            <div className="w-full flex flex-col gap-3">
              <Button
                onClick={handleSignOut}
                disabled={isSigningOut || isGoingHome}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 font-sans disabled:opacity-75"
              >
                {isSigningOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                {isSigningOut ? "Signing Out..." : "Sign Out & Switch Account"}
              </Button>
              <Button
                onClick={handleGoHome}
                disabled={isSigningOut || isGoingHome}
                variant="outline"
                className="w-full border border-border hover:bg-secondary text-foreground font-semibold py-6 rounded-xl transition duration-200 font-sans disabled:opacity-75 flex items-center justify-center gap-2"
              >
                {isGoingHome ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {isGoingHome ? "Redirecting..." : "Return to Homepage"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ProfileSetupForm />
    </div>
  );
}


