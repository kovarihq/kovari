"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@kovari/utils";

interface MobileBackNavProps {
  /** Page title shown next to the back arrow */
  title?: string;
  /** Explicit href to navigate to. Defaults to router.back() */
  fallbackHref?: string;
  /** Force redirect to this path, ignoring history stack completely */
  forceHref?: string;
  /** Extra classes on the root wrapper */
  className?: string;
  /** Extra classes on the back button */
  buttonClassName?: string;
  /** Extra classes on the title text span */
  titleClassName?: string;
  /** Slot for an optional right-side action (e.g. a button) */
  rightSlot?: React.ReactNode;
}

/**
 * MobileBackNav
 *
 * A lightweight, reusable top-bar navigation component for secondary/detail
 * pages on mobile. It renders ONLY on screens below `md` (hidden on desktop).
 *
 * Usage:
 *   <MobileBackNav title="Notifications" fallbackHref="/dashboard" />
 *   <MobileBackNav title="Settings" fallbackHref="/profile" rightSlot={<Button>Save</Button>} />
 */
export function MobileBackNav({
  title,
  fallbackHref,
  forceHref,
  className,
  buttonClassName,
  titleClassName,
  rightSlot,
}: MobileBackNavProps) {
  const router = useRouter();

  const handleBack = () => {
    if (forceHref) {
      router.push(forceHref);
    } else if (fallbackHref) {
      // Try browser history first; if there's nothing to go back to, use fallback
      router.back();
    } else {
      router.back();
    }
  };

  return (
    <div
      className={cn(
        "md:hidden flex items-center justify-between px-2 py-2 border-b border-border bg-card flex-shrink-0",
        className
      )}
    >
      <button
        type="button"
        onClick={handleBack}
        className={cn(
          "flex items-center gap-1 text-primary focus-visible:outline-none focus-visible:ring-0 -ml-1 px-1 py-1",
          buttonClassName
        )}
        aria-label="Go back"
      >
        <ChevronLeft className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
        {title && (
          <span className={cn("text-sm font-medium truncate max-w-[200px]", titleClassName)}>
            {title}
          </span>
        )}
      </button>

      {rightSlot && (
        <div className="flex items-center">{rightSlot}</div>
      )}
    </div>
  );
}
