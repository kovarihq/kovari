"use client";

import React, { useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@heroui/react";
import { toast } from "sonner";

interface WaitlistModalProps {
  open: boolean;
  onChange?: (open: boolean) => void; // Support HeroUI's name if needed, though we use onOpenChange
  onOpenChange: (open: boolean) => void;
  source?: string;
  onSuccess?: () => void;
}

export default function WaitlistModal({
  open,
  onOpenChange,
  source = "unknown",
  onSuccess,
}: WaitlistModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setEmail("");
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, source }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle error responses
        const errorMessage =
          data.error || "Failed to join waitlist. Please try again.";
        toast.error(errorMessage);
        return;
      }

      // Track successful waitlist submission
      Sentry.startSpan(
        {
          op: "waitlist.submit",
          name: "Waitlist Submission Success",
        },
        (span) => {
          span.setAttribute("success", true);
          span.setAttribute("email_domain", email.split("@")[1] || "unknown");
          span.setAttribute("waitlist_id", data.data?.id || "unknown");
        }
      );

      // Success
      toast.success("Successfully joined the waitlist!", {
        description: "We'll notify you when Kovari is ready.",
      });

      if (onSuccess) {
        onSuccess();
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("waitlist-joined"));
      }

      // Close modal and reset form on success
      onOpenChange(false);
      setEmail("");

    } catch (error) {
      Sentry.captureException(error);
      console.error("Error submitting waitlist:", error);
      toast.error("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-sans w-[95vw] max-w-xs sm:max-w-md md:max-w-lg p-6 sm:p-8 !rounded-2xl !fixed !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !m-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-semibold text-left text-foreground">
            Join our waitlist
          </DialogTitle>
          <DialogDescription className="text-left text-muted-foreground text-xs sm:text-sm mt-1 sm:mt-2">
            Be among the first to experience Kovari. Get early access to match
            with travelers and plan trips together.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-2 sm:space-y-4 mt-3 sm:mt-4"
        >
          {/* Email Input */}
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs sm:text-sm font-medium leading-none text-foreground"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-10 sm:h-12 text-sm sm:text-base rounded-full px-4"
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting || !email}
            className="w-full h-10 sm:h-12 bg-primary text-primary-foreground font-semibold text-sm sm:text-base shadow-sm hover:bg-primary/90 disabled:opacity-50"
            radius="full"
            variant="solid"
          >
            {isSubmitting ? "Joining..." : "Join Waitlist"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

