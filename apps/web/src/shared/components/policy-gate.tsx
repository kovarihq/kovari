"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { diagLog } from "@/lib/observability/performance";
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  GUIDELINES_VERSION,
} from "@/lib/policy-versions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";

interface PolicyData {
  terms_version?: string | null;
  privacy_version?: string | null;
  guidelines_version?: string | null;
}

// Routes where the PolicyGate should never appear
const EXEMPT_PATHS = [
  "/onboarding",
  "/banned",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/verify-email",
  "/sso-callback",
];

export function PolicyGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [manuallyAccepted, setManuallyAccepted] = useState(false);

  useEffect(() => {
    diagLog("PolicyGate mounted");
    let mounted = true;
    if (!isLoaded || !isSignedIn) {
      if (mounted) setLoading(false);
      return;
    }
    const check = async () => {
      diagLog("Policy Check Fetch Triggered");
      const start = performance.now();
      try {
        const res = await fetch("/api/settings/accept-policies", { 
          cache: "no-store", 
          headers: { 'Cache-Control': 'no-cache' } 
        });
        diagLog(`Policy Check Fetch completed in ${Math.round(performance.now() - start)}ms`);
        if (!res.ok) { 
          if (mounted) setLoading(false);
          return; 
        }
        const data: PolicyData = await res.json();
        // Only trigger the gate if they HAVE accepted a policy previously, but it's an OLD version.
        // If they have never accepted any policy (versions are null/empty), we assume they are a fresh signup
        // and let the /onboarding flow handle their initial policy acceptance without race conditions.
        const outdated = !!(
          (data.terms_version && data.terms_version !== TERMS_VERSION) ||
          (data.privacy_version && data.privacy_version !== PRIVACY_VERSION) ||
          (data.guidelines_version && data.guidelines_version !== GUIDELINES_VERSION)
        );
        
        if (mounted && !manuallyAccepted) {
          setNeedsAcceptance(outdated);
        }
      } catch {
        diagLog(`Policy Check Fetch failed in ${Math.round(performance.now() - start)}ms`);
        // fail open
      } finally {
        if (mounted) setLoading(false);
      }
    };
    check();
    return () => { mounted = false; };
  }, [isLoaded, isSignedIn, manuallyAccepted]);

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setManuallyAccepted(true);
    setNeedsAcceptance(false);

    try {
      await fetch("/api/settings/accept-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          guidelinesVersion: GUIDELINES_VERSION,
        }),
      });
    } catch {
      // fail open
    } finally {
      setSubmitting(false);
    }
  };

  // While checking, or not signed in, or no re-acceptance needed — render normally
  // Also skip the gate on exempt routes (onboarding, auth pages, etc.)
  const isExempt = EXEMPT_PATHS.some((p) => pathname?.startsWith(p));

  if (loading || !isSignedIn || !needsAcceptance || isExempt) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Render children normally — no wrapper that breaks flex layout */}
      {children}

      {/* Full-screen overlay — backdrop-blur-sm blurs everything behind it */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">
              We&apos;ve updated our policies
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Please review and accept the updated terms to continue using Kovari.
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {[
              { label: "Terms of Service", href: "/terms" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Community Guidelines", href: "/community-guidelines" },
            ].map(({ label, href }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline underline-offset-2"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              id="policy-gate-checkbox"
              checked={checked}
              onCheckedChange={(v) => setChecked(!!v)}
              className="mt-0.5 flex-shrink-0"
            />
            <span className="text-sm text-muted-foreground leading-snug">
              I agree to the updated{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Terms of Service</a>
              ,{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Privacy Policy</a>
              , and{" "}
              <a href="/community-guidelines" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Community Guidelines</a>.
            </span>
          </label>

          <Button
            disabled={!checked || submitting}
            onClick={handleAccept}
            className="w-full rounded-full"
          >
            {submitting ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </>
  );
}

