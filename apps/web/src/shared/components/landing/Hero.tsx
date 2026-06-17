"use client";

import React, { useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

const BUTTON_WIDTH = "w-[170px]";
const BUTTON_HEIGHT = "h-12";
const BUTTON_TEXT_SIZE = "text-small";

const HERO_TITLE_GRADIENT =
  "bg-hero-section-title bg-clip-text text-foreground";
const HERO_SUBTITLE_GRADIENT =
  "bg-gradient-to-b from-primary from-50% to-transparent to-100% bg-clip-text text-transparent";

const HERO_DESCRIPTION =
  "Real travelers. Same destination. Same energy.\nNo more group chats that go nowhere.";

const HERO_SECTION_CLASSES =
  "z-20 flex flex-col items-center gap-[28px] sm:gap-6 sm:justify-center";

interface HeroProps {
  onJoinWaitlist?: () => void;
}

export default function Hero({ onJoinWaitlist }: HeroProps) {
  const router = useRouter();

  const handleJoinWaitlist = useCallback(() => {
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Join the Waitlist Button Click",
      },
      (span) => {
        span.setAttribute("button_location", "hero");
        span.setAttribute("action", "open_waitlist_modal");

        if (onJoinWaitlist) {
          onJoinWaitlist();
        } else {
          router.push("/sign-up");
        }
      }
    );
  }, [onJoinWaitlist, router]);

  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" as const },
    },
  };

  const mockupVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, delay: 0.6, ease: "easeOut" as const },
    },
  };

  return (
    <section 
      className="relative w-full sm:flex sm:flex-col sm:overflow-hidden overflow-x-hidden pt-32 pb-32 md:pt-40 md:pb-48"
    >
      <div className="container mx-auto px-6 md:px-8 relative z-10">
        <motion.div 
          className={HERO_SECTION_CLASSES}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <span className="text-[10px] tracking-[0.12em] sm:tracking-[0.25em] text-muted-foreground/80 uppercase mb-3 font-mono text-center">
              Plan Trips. Find People. Travel Together.
            </span>
          </motion.div>

          <motion.div variants={itemVariants} className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight leading-tight mb-4 max-w-4xl mx-auto">
              You planned the trip.<br />
              <span className="text-primary">Nobody</span> bought the ticket.
            </h1>
          </motion.div>

          <motion.p variants={itemVariants} className="text-muted-foreground text-sm sm:text-base md:text-lg font-light max-w-[90vw] sm:max-w-xl mx-auto leading-relaxed mb-12 text-center">
            {HERO_DESCRIPTION}
          </motion.p>
          
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center gap-4 mt-1">
            <Button
              className="h-12 sm:h-14 bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg px-12 py-5 sm:py-6 text-sm sm:text-base font-semibold leading-5"
              radius="full"
              variant="solid"
              aria-label="Join the Waitlist"
              onPress={handleJoinWaitlist}
            >
              Join the waitlist
            </Button>
            <Link
              href="/sign-in"
              className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors font-medium underline underline-offset-4"
            >
              Already in Closed Beta? Log In
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
