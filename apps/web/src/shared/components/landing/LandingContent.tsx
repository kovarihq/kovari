"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Hero from "@/shared/components/landing/Hero";
import { getAllDestinations } from "@/lib/data/topPicksDestinations";
import { trackEvent } from "@kovari/utils";

// Lazy load below-the-fold content to aggressively improve JS parsing and TBT on mobile
const Problem = dynamic(() => import("@/shared/components/landing/Problem"));
const NotForEveryone = dynamic(() => import("@/shared/components/landing/NotForEveryone"));
const Audience = dynamic(() => import("@/shared/components/landing/Audience"));
const HowItWorks = dynamic(() => import("@/shared/components/landing/HowItWorks"));
const Features = dynamic(() => import("@/shared/components/landing/Features"));
const Safety = dynamic(() => import("@/shared/components/landing/Safety"));
const FinalCTA = dynamic(() => import("@/shared/components/landing/FinalCTA"));
const Footer = dynamic(() => import("@/shared/components/landing/Footer"));
const WaitlistModal = dynamic(() => import("@/shared/components/landing/WaitlistModal"), { ssr: false });

interface LandingContentProps {
  initialWaitlistCount: number | null;
}

export default function HomePage({ initialWaitlistCount }: LandingContentProps) {
  // Get all top picks destinations
  const allDestinations = getAllDestinations();
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [waitlistSource, setWaitlistSource] = useState("unknown");
  const [waitlistCount, setWaitlistCount] = useState<number | null>(initialWaitlistCount);

  const openWaitlist = (source: string) => {
    trackEvent("waitlist_click", { source });
    setWaitlistSource(source);
    setIsWaitlistModalOpen(true);
  };

  // Synchronize waitlist count changes globally (e.g. from Navbar modal)
  useEffect(() => {
    const handleWaitlistJoined = () => {
      setWaitlistCount((prev) => (prev !== null ? prev + 1 : 1));
    };

    if (typeof window !== "undefined") {
      window.addEventListener("waitlist-joined", handleWaitlistJoined);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("waitlist-joined", handleWaitlistJoined);
      }
    };
  }, []);

  // Track page view on mount
  useEffect(() => {
    trackEvent("landing_view");
    Sentry.startSpan(
      {
        op: "navigation",
        name: "Landing Page View",
      },
      (span) => {
        span.setAttribute("page", "landing");
        span.setAttribute("path", "/");
      }
    );
  }, []);

  return (
    <div className="bg-background min-h-screen font-sans text-foreground overflow-x-hidden selection:bg-primary/20">
      <Hero
        waitlistCount={waitlistCount}
        onJoinWaitlist={() => openWaitlist("hero_cta")}
      />

      {/* Problem Statement Section */}
      <Problem />

      <section className="w-full py-28 md:py-36 relative overflow-hidden">
        <div className="container mx-auto px-6 md:px-8 text-center relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight leading-tight select-none">
            There&apos;s a better way to find your people.
          </h2>
        </div>
      </section>

      {/* Exclusivity Section */}
      <NotForEveryone />

      {/* Who Kovari Is For Section */}
      <Audience />

      {/* How Kovari Works Section */}
      <HowItWorks />

      {/* Core Features Section */}
      <Features />

      {/* Safety & Trust Section */}
      <Safety />

      {/* Final CTA Section */}
      <FinalCTA onJoinWaitlist={() => openWaitlist("final_cta")} />

      {/* Footer */}
      <Footer />

      {/* Top Picks Section */}
      {/* <TopPicksSection destinations={allDestinations} className="bg-gray-50" /> */}

      {/* Waitlist Modal */}
      <WaitlistModal
        open={isWaitlistModalOpen}
        onOpenChange={setIsWaitlistModalOpen}
        source={waitlistSource}
        onSuccess={() => {
          setWaitlistCount((prev) => (prev !== null ? prev + 1 : 1));
        }}
      />
    </div>
  );
}

