"use client";

import React, { useCallback } from "react";
import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    if (onJoinWaitlist) {
      onJoinWaitlist();
    } else {
      router.push("/sign-up");
    }
  }, [onJoinWaitlist, router]);

  return (
    <section 
      className="relative w-full sm:flex sm:flex-col sm:overflow-hidden overflow-x-hidden pt-32 pb-32 md:pt-40 md:pb-48"
    >
      <div className="container mx-auto px-6 md:px-8 relative z-10">
        <div 
          className={HERO_SECTION_CLASSES}
        >
          <div className="flex flex-col items-center animate-fade-in-up [animation-delay:0ms]">
            <span className="text-[10px] tracking-[0.12em] sm:tracking-[0.25em] text-muted-foreground/80 uppercase mb-3 font-mono text-center">
              Plan Trips. Find People. Travel Together.
            </span>
          </div>

          <div className="text-center animate-fade-in-up [animation-delay:100ms]">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight leading-tight mb-4 max-w-4xl mx-auto">
              You planned the trip.<br />
              <span className="text-primary">Nobody</span> bought the ticket.
            </h1>
          </div>

          <p className="text-muted-foreground text-sm sm:text-base md:text-lg font-light max-w-[90vw] sm:max-w-xl mx-auto leading-relaxed mb-12 text-center animate-fade-in-up [animation-delay:200ms]">
            {HERO_DESCRIPTION}
          </p>
          
          <div className="flex flex-col items-center justify-center gap-4 mt-1 animate-fade-in-up [animation-delay:300ms]">
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
          </div>
        </div>
      </div>
    </section>
  );
}
