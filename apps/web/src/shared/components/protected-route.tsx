"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Spinner } from "@heroui/react";
import { useSyncUserToSupabase } from "@kovari/api/client";
import { diagLog } from "@/lib/observability/performance";
import { activationService } from "@/lib/activation/activation.service";
import { ActivationModal } from "@/shared/components/activation-modal";

const ONBOARDING_PATH_PREFIX = "/onboarding";
const PROFILE_EDIT_PATH_PREFIX = "/profile/edit";

function isOnboardingPath(path: string | null): boolean {
  return (
    path === ONBOARDING_PATH_PREFIX ||
    (path?.startsWith(`${ONBOARDING_PATH_PREFIX}/`) ?? false)
  );
}

function isProfileEditPath(path: string | null): boolean {
  return (
    path === PROFILE_EDIT_PATH_PREFIX ||
    (path?.startsWith(`${PROFILE_EDIT_PATH_PREFIX}/`) ?? false)
  );
}

/**
 * Protects app routes: ensures user is signed in, synced to Supabase, and has
 * completed activation (profile picture & travel intentions exist). Unactivated users
 * see the premium ActivationModal and are guided to complete setup.
 */
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { syncUser } = useSyncUserToSupabase();
  const debug = process.env.NODE_ENV !== "production";

  const [phase, setPhase] = useState<
    "sync" | "check_profile" | "allow" | "activation_modal" | "redirect"
  >("sync");
  const [currentProfileData, setCurrentProfileData] = useState<any>(null);
  const syncedRef = useRef(false);
  const profileConfirmedRef = useRef(false);
  const checkDoneThisCycleRef = useRef(false);

  // 1. Unauthenticated state is strictly handled by middleware.ts
  useEffect(() => {
    diagLog("ProtectedRoute mounted");
  }, []);

  // 2. One-time sync user to Supabase
  useEffect(() => {
    if (!isLoaded || !isSignedIn || syncedRef.current) return;
    syncedRef.current = true;
    setPhase("sync");
    diagLog("Syncing User Triggered");
    syncUser()
      .then((ok) => {})
      .catch((err) => console.error("[ProtectedRoute] sync failed", err))
      .finally(() => setPhase("check_profile"));
  }, [isLoaded, isSignedIn, syncUser]);

  // 3. Onboarding gate: allow /onboarding; otherwise require profile activation
  useEffect(() => {
    if (!isLoaded || !isSignedIn || phase === "sync") return;

    const path = pathname ?? "";

    if (isOnboardingPath(path) || isProfileEditPath(path)) {
      if (!profileConfirmedRef.current) checkDoneThisCycleRef.current = false;
      setPhase("allow");
      return;
    }

    if (phase === "redirect" || phase === "activation_modal") return;

    if (profileConfirmedRef.current) {
      setPhase("allow");
      return;
    }

    if (phase !== "check_profile" && checkDoneThisCycleRef.current) {
      setPhase("allow");
      return;
    }

    checkDoneThisCycleRef.current = true;

    const runProfileCheck = () => {
      diagLog("ProtectedRoute fetchProfile triggered");
      const start = performance.now();
      fetch("/api/profile/current", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
        .then(async (res) => {
          diagLog(`ProtectedRoute fetchProfile completed in ${Math.round(performance.now() - start)}ms`);
          const isExistingUser = user?.createdAt
            ? (new Date().getTime() - new Date(user.createdAt).getTime()) > 24 * 60 * 60 * 1000
            : false;

          if (res.ok) {
            const json = await res.json();
            const profileData = json?.data;
            setCurrentProfileData(profileData);
            const activation = activationService.verifyActivation(profileData);
            
            if (activation.isActivated && profileData?.onboardingCompleted === true) {
              profileConfirmedRef.current = true;
              setPhase("allow");
            } else if (profileData?.onboardingCompleted === true || isExistingUser) {
              setPhase("activation_modal");
            } else {
              setPhase("redirect");
              router.replace(ONBOARDING_PATH_PREFIX);
            }
          } else {
            if (isExistingUser) {
              setPhase("activation_modal");
            } else {
              setPhase("redirect");
              router.replace(ONBOARDING_PATH_PREFIX);
            }
          }
        })
        .catch((err) => {
          diagLog(`ProtectedRoute fetchProfile failed in ${Math.round(performance.now() - start)}ms`);
          const isExistingUser = user?.createdAt
            ? (new Date().getTime() - new Date(user.createdAt).getTime()) > 24 * 60 * 60 * 1000
            : false;
          if (isExistingUser) {
            setPhase("activation_modal");
          } else {
            setPhase("redirect");
            router.replace(ONBOARDING_PATH_PREFIX);
          }
        });
    };

    if (phase === "allow") {
      runProfileCheck();
      return;
    }

    setPhase("check_profile");
    runProfileCheck();
  }, [isLoaded, isSignedIn, phase, pathname, router, user]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const path = pathname ?? "";
  if (isOnboardingPath(path) || isProfileEditPath(path)) {
    return <>{children}</>;
  }

  if (phase === "sync" || phase === "check_profile") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-card h-screen">
        <Spinner variant="spinner" size="md" color="primary" />
      </div>
    );
  }

  if (phase === "activation_modal") {
    return (
      <>
        <ActivationModal profileData={currentProfileData} />
        {children}
      </>
    );
  }

  return <>{children}</>;
}

