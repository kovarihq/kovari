"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Compass, User, Check, ChevronRight, Sparkles, MapPin } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { activationService, ActivationCheckInput } from "@/lib/activation/activation.service";
import { cn } from "@kovari/utils";
import { useUser, useAuth } from "@clerk/nextjs";
import { trackActivationEvent } from "@/lib/analytics/trackActivation";

interface ActivationModalProps {
  profileData?: ActivationCheckInput | null;
  onContinue?: () => void;
}

export function ActivationModal({ profileData, onContinue }: ActivationModalProps) {
  const router = useRouter();
  const ctaRef = useRef<HTMLButtonElement>(null);
  const { user } = useUser();
  const { sessionId } = useAuth();

  const activation = activationService.verifyActivation(profileData);
  const { hasProfilePicture, hasTravelIntentions } = activation;

  // Calculate progress
  const completedCount = (hasProfilePicture ? 1 : 0) + (hasTravelIntentions ? 1 : 0);
  const totalCount = 2;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  useEffect(() => {
    // Focus CTA for keyboard accessibility
    ctaRef.current?.focus();

    if (user) {
      const authProvider = user.externalAccounts?.[0]?.provider || (user.passwordEnabled ? "password" : "email");
      const userType = profileData?.onboardingCompleted ? "existing" : "new";
      void trackActivationEvent("activation_modal_shown", {
        userId: user.id,
        sessionId,
        authProvider,
        userType,
      });
    }

    // Trap Escape key to prevent dismissal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [user, sessionId, profileData]);

  const handleCTA = () => {
    if (onContinue) {
      onContinue();
    } else {
      if (typeof window !== "undefined" && window.location.pathname !== "/onboarding") {
        sessionStorage.setItem("kovari_origin_url", window.location.pathname + window.location.search);
      }
      router.push("/onboarding");
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 overflow-y-auto select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6 text-card-foreground relative overflow-hidden"
      >
        {/* Background Ambient Decorative Light */}
        <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        {/* Header Icon Badge & Title */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
            <Compass className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
              <Sparkles className="w-3 h-3" />
              <span>Activation Required</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground font-heading">
              Complete Your Kovari Setup
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed font-sans">
              You&apos;re almost ready to explore and connect with travel buddies! Complete these quick steps to unlock your account.
            </p>
          </div>
        </div>

        {/* Progress Section */}
        <div className="bg-secondary/40 border border-border/60 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Setup Progress</span>
            <span className="text-primary font-semibold">{progressPercent}% Completed</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full bg-primary rounded-full"
            />
          </div>

          {/* Checklist Items */}
          <div className="flex flex-col gap-2.5 mt-1">
            {/* Step 1: Profile Photo */}
            <div
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border text-xs font-medium transition-colors",
                hasProfilePicture
                  ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-background border-border text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center",
                    hasProfilePicture ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {hasProfilePicture ? <Check className="w-4 h-4 stroke-[3]" /> : <User className="w-4 h-4" />}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">Profile Picture</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {hasProfilePicture ? "Uploaded" : "Required for community trust"}
                  </span>
                </div>
              </div>
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", hasProfilePicture ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                {hasProfilePicture ? "Done" : "Pending"}
              </span>
            </div>

            {/* Step 2: Travel Intention */}
            <div
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border text-xs font-medium transition-colors",
                hasTravelIntentions
                  ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-background border-border text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center",
                    hasTravelIntentions ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {hasTravelIntentions ? <Check className="w-4 h-4 stroke-[3]" /> : <MapPin className="w-4 h-4" />}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">Travel Intention</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {hasTravelIntentions ? "Added" : "Add at least 1 destination"}
                  </span>
                </div>
              </div>
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", hasTravelIntentions ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                {hasTravelIntentions ? "Done" : "Pending"}
              </span>
            </div>
          </div>
        </div>

        {/* Single Primary CTA */}
        <Button
          ref={ctaRef}
          onClick={handleCTA}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 font-sans text-sm"
        >
          <span>Continue Setup</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </div>
  );
}
