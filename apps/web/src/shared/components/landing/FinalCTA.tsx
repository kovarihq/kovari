"use client";

import React, { useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@heroui/react";
import { motion } from "framer-motion";

interface FinalCTAProps {
  onJoinWaitlist?: () => void;
}

export default function FinalCTA({ onJoinWaitlist }: FinalCTAProps) {
  const handleJoinWaitlistClick = useCallback(() => {
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Join the Waitlist Button Click",
      },
      (span) => {
        span.setAttribute("button_location", "final_cta");
        span.setAttribute("action", "open_waitlist_modal");

        if (onJoinWaitlist) {
          onJoinWaitlist();
        }
      }
    );
  }, [onJoinWaitlist]);

  return (
    <section 
      className="relative py-14 md:py-24 lg:py-32 overflow-hidden text-center"
    >
      <div className="container mx-auto px-6 md:px-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center px-4 relative z-10"
        >
          {/* Heading */}
          <h2 className="text-2xl md:text-4xl font-bold text-foreground tracking-tight mb-8 leading-tight">
            Don&apos;t let that Ladakh trip stay a saved Instagram reel.
          </h2>

          {/* Subtext */}
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg font-light mb-8 max-w-xl mx-auto leading-relaxed">
            Batch 1 is live. Batch 2 coming soon &mdash; join the waitlist to get early access.
          </p>

          {/* Primary CTA */}
          <Button
            className="h-12 sm:h-14 bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg px-12 sm:px-12 py-5 sm:py-6 text-sm sm:text-base font-semibold leading-5 animate-pulse-subtle"
            radius="full"
            variant="solid"
            aria-label="Request Early Access"
            onPress={handleJoinWaitlistClick}
          >
            Request early access
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
