"use client";

import React from "react";
import { ThemeToggle } from "./theme-toggle";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Label } from "@/shared/components/ui/label";

export function AppearanceSection() {
  const isMobile = useIsMobile();

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-0" : "p-4"} space-y-6`}>
      <div className="md:space-y-2 space-y-1">
        <h1 className="md:text-lg text-sm font-semibold text-foreground">
          Appearance
        </h1>
        <p className="md:text-sm text-xs text-muted-foreground">
          Customize how Kovari looks on your device.
        </p>
      </div>

      <section
        className={`rounded-2xl border border-border ${
          isMobile ? "bg-card p-0 shadow-none" : "bg-transparent p-4 px-6 shadow-none"
        }`}
      >
        <div className={isMobile ? "space-y-4 px-4 pt-4 pb-4" : "space-y-4"}>
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <Label className="text-foreground text-sm">Theme</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Select your preferred color theme. System follows your device setting.
              </p>
            </div>
            <div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
