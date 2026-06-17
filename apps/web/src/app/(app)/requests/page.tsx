"use client";

import { useState, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import InvitationResults, {
  GroupInvite,
} from "@/features/invitations/components/InvitationResults";
import InterestResults, {
  Interest,
} from "@/features/interests/components/InterestResults";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import InvitationCardSkeleton from "@/features/invitations/components/InvitationCardSkeleton";
import { toast } from "sonner";
import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

const REQUEST_TABS = [
  { label: "Interests", value: "interests" },
  { label: "Invitations", value: "invitations" },
] as const;

type TabValue = (typeof REQUEST_TABS)[number]["value"];

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<number>(0); // Default to Interests (index 0)
  const [invitations, setInvitations] = useState<GroupInvite[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetchedInvitations, setHasFetchedInvitations] = useState(false);
  const [hasFetchedInterests, setHasFetchedInterests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "invitations") {
      setActiveTab(1);
    } else if (tab === "interests") {
      setActiveTab(0);
    }
  }, [searchParams]);

  const handleTabChange = useCallback((index: number) => {
    setIsLoading(true);
    setActiveTab(index);
  }, []);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTabChange((activeTab + 1) % REQUEST_TABS.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTabChange(
          (activeTab - 1 + REQUEST_TABS.length) % REQUEST_TABS.length
        );
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleTabChange(index);
      } else if (event.key === "Home") {
        event.preventDefault();
        handleTabChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        handleTabChange(REQUEST_TABS.length - 1);
      }
    },
    [activeTab, handleTabChange]
  );

  const tabButtons = useMemo(
    () =>
      REQUEST_TABS.map((tab, idx) => (
        <Button
          key={tab.label}
          variant={"secondary"}
          className={`text-xs sm:text-sm bg-card border border-border ${
            activeTab === idx
              ? "text-primary font-semibold rounded-2xl shadow-sm hover:text-primary border-1 border-primary"
              : "text-foreground font-semibold rounded-2xl hover:text-primary"
          }`}
          onClick={() => handleTabChange(idx)}
          onKeyDown={(e) => handleTabKeyDown(e, idx)}
        >
          {tab.label}
        </Button>
      )),
    [activeTab, handleTabChange, handleTabKeyDown]
  );

  const fetchPendingInvitations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/pending-invitations");

      if (!response.ok) {
        throw new Error("Failed to fetch invitations");
      }

      const data = await response.json();
      setInvitations(data.data || data);
      setHasFetchedInvitations(true);
    } catch (err) {
      console.error("Error fetching invitations:", err);
      setError("Failed to load invitations. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInterests = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/interests");

      if (!response.ok) {
        throw new Error("Failed to fetch interests");
      }

      const data = await response.json();
      setInterests(data.data || data);
      setHasFetchedInterests(true);
    } catch (err) {
      console.error("Error fetching interests:", err);
      setError("Failed to load interests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      const response = await fetch("/api/group-invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId: invitationId,
          action: "accept",
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to accept invitation";
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      toast.success("Invitation accepted successfully!");

      // Show success message for a moment before removing
      setTimeout(() => {
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      }, 3000);
    } catch (err) {
      console.error("Error accepting invitation:", err);
      toast.error(err instanceof Error ? err.message : "Failed to accept invitation");
      throw err;
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      const response = await fetch("/api/group-invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId: invitationId,
          action: "decline",
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to decline invitation";
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      toast.success("Invitation declined.");

      // Remove the declined invitation from the list
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      console.error("Error declining invitation:", err);
      toast.error(err instanceof Error ? err.message : "Failed to decline invitation");
      throw err;
    }
  };

  const handleAcceptInterest = async (interestId: string) => {
    try {
      const response = await fetch("/api/interests/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interestId,
          action: "accept",
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to connect";
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      toast.success("Match interest accepted!");

      // Show success message for a moment before removing
      setTimeout(() => {
        setInterests((prev) => prev.filter((i) => i.id !== interestId));
      }, 3000);
    } catch (err) {
      console.error("Error accepting interest:", err);
      toast.error(err instanceof Error ? err.message : "Failed to accept interest");
      throw err;
    }
  };

  const handleDeclineInterest = async (interestId: string) => {
    try {
      const response = await fetch("/api/interests/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interestId,
          action: "decline",
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to pass interest";
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      toast.success("Match interest declined.");

      // Remove the declined interest from the list
      setInterests((prev) => prev.filter((i) => i.id !== interestId));
    } catch (err) {
      console.error("Error declining interest:", err);
      toast.error(err instanceof Error ? err.message : "Failed to decline interest");
      throw err;
    }
  };

  useEffect(() => {
    if (userId) {
      if (REQUEST_TABS[activeTab].value === "invitations") {
        fetchPendingInvitations();
      } else if (REQUEST_TABS[activeTab].value === "interests") {
        fetchInterests();
      }
    }
  }, [userId, activeTab]);

  // Show skeleton loading while auth is loading
  if (!isLoaded) {
    return (
      <div className="flex flex-col w-full min-h-screen">
        <div className="w-full flex flex-row items-center gap-2 px-4 py-6">
          {tabButtons}
        </div>
        <div className="w-full flex-1 px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
            {Array.from({ length: 8 }).map((_, i) => (
              <InvitationCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Only show sign-in warning after auth has loaded and user is not signed in
  if (isLoaded && !userId) {
    return (
      <div className="flex flex-col w-full min-h-screen">
        <div className="w-full flex flex-row items-center gap-2 px-4 py-6">
          {tabButtons}
        </div>
        <div className="w-full flex-1 px-4">
          <div className="text-center text-muted-foreground py-8">
            Please sign in to view your interests.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen">
      {/* Mobile back nav */}
      <MobileBackNav title="Requests" fallbackHref="/dashboard" titleClassName="text-xs" />

      {/* Tabs Header */}
      <div className="w-full flex flex-row items-center gap-2 px-4 py-4 sticky top-0 z-50 bg-background">
        {tabButtons}
      </div>

      {/* Tab Content */}
      <div className="w-full flex-1 px-4">
        {REQUEST_TABS[activeTab].value === "interests" && (
          <>
            {isLoading || !hasFetchedInterests ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
                {Array.from({ length: 16 }).map((_, i) => (
                  <InvitationCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="text-center text-red-500 py-8" role="alert">
                {error}
                <Button
                  onClick={fetchInterests}
                  className="mt-4"
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <InterestResults
                interests={interests}
                onAccept={handleAcceptInterest}
                onDecline={handleDeclineInterest}
                isLoading={isLoading}
              />
            )}
          </>
        )}

        {REQUEST_TABS[activeTab].value === "invitations" && (
          <>
            {isLoading || !hasFetchedInvitations ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
                {Array.from({ length: 16 }).map((_, i) => (
                  <InvitationCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="text-center text-red-500 py-8" role="alert">
                {error}
                <Button
                  onClick={fetchPendingInvitations}
                  className="mt-4"
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <InvitationResults
                invitations={invitations}
                onAccept={handleAcceptInvitation}
                onDecline={handleDeclineInvitation}
                isLoading={isLoading}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

