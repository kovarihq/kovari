"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error details to Sentry and the console for auditing
    console.error("Analytics dashboard boundary error caught:", error);
    Sentry.captureException(error, {
      tags: {
        boundary: "analytics-error",
      },
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 space-y-5 max-w-md mx-auto">
      <div className="bg-destructive/10 p-3.5 rounded-2xl">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      
      <div className="space-y-1.5">
        <h2 className="text-md font-semibold text-foreground">
          Failed to Load Analytics
        </h2>
        <p className="text-sm text-muted-foreground leading-normal">
          An error occurred while fetching cohort data. This has been reported to support. Please check your network connection and try again.
        </p>
      </div>

      <Button
        onClick={() => reset()}
        variant="outline"
        size="sm"
        className="bg-card border-border h-9 px-4 rounded-xl gap-2 cursor-pointer transition-all active:scale-[0.98]"
      >
        <RefreshCw className="h-4 w-4 text-primary" />
        <span className="font-semibold text-xs">Reload Dashboard</span>
      </Button>
    </div>
  );
}
