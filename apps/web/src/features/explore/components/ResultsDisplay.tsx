"use client";

import { useToast } from "@/shared/hooks/use-toast";

import { useEffect, useState } from "react";
import { SoloMatchCard } from "./SoloMatchCard";
import { GroupMatchCard } from "./GroupMatchCard";
import { Spinner } from "@heroui/react";
import { Users } from "lucide-react";
import { ReportDialog } from "@/shared/components/ReportDialog";

import { SearchData, SoloMatch, GroupMatch } from "../types";
import { createReportRecord } from "../lib/matchingActions";

interface ResultsDisplayProps {
  activeTab: number;
  matchedGroups: (SoloMatch | GroupMatch)[];
  currentGroupIndex: number;
  searchLoading: boolean;
  searchError: string | null;
  lastSearchData: SearchData | null;
  onPreviousGroup: () => void;
  onNextGroup: () => void;
  onPass: (matchId: string) => Promise<void>;
  onViewProfile: (userId: string) => void;
  onJoinGroup: (groupId: string) => Promise<void>;
  onPassGroup: (groupId: string) => Promise<void>;
  onViewGroup: (groupId: string) => void;
  onConnect?: (matchId: string) => Promise<void>;
  onSuperLike?: (matchId: string) => Promise<void>;
  onComment?: (
    matchId: string,
    attribute: string,
    comment: string,
  ) => Promise<void>;
  onRequestJoin?: (groupId: string) => Promise<void>;
  currentUserId?: string;
  destinationId?: string;
  onSearchWithoutDestination?: () => void;
}

function isSoloMatch(match: SoloMatch | GroupMatch): match is SoloMatch {
  return "is_solo_match" in match;
}

export const ResultsDisplay = ({
  activeTab,
  matchedGroups,
  currentGroupIndex,
  searchLoading,
  searchError,
  lastSearchData,
  onPreviousGroup,
  onNextGroup,
  onPass,
  onViewProfile,
  onJoinGroup,
  onPassGroup,
  onViewGroup,
  onConnect,
  onSuperLike,
  onComment,
  onRequestJoin,
  currentUserId,
  destinationId,
  onSearchWithoutDestination,
}: ResultsDisplayProps) => {
  const { toast } = useToast();
  const [reportDialogState, setReportDialogState] = useState<{
    open: boolean;
    targetType: "user" | "group";
    targetId: string;
    targetName?: string;
  }>({
    open: false,
    targetType: "user",
    targetId: "",
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        onPreviousGroup();
      } else if (event.key === "ArrowRight") {
        onNextGroup();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onPreviousGroup, onNextGroup]);

  // Conditional Match Card Component
  const MatchCardComponent = () => {
    const currentMatch = matchedGroups[currentGroupIndex];

    if (!currentMatch) {
      return null;
    }

    if (activeTab === 0) {
      const soloMatch = currentMatch as SoloMatch;
      return (
        <SoloMatchCard
          key={soloMatch.id}
          match={soloMatch}
          destinationId={destinationId || lastSearchData?.destination || ""}
          currentUserId={currentUserId || ""}
          onViewProfile={onViewProfile}
          onInterested={async (userId) => {
            if (onConnect) {
              await onConnect(userId);
            } else {
              await onPass(userId);
            }
          }}
          onSkip={(skippedUserId) => onPass(skippedUserId)}
          onReportClick={() =>
            setReportDialogState({
              open: true,
              targetType: "user",
              targetId: soloMatch.user.userId,
              targetName: soloMatch.name || soloMatch.user?.name,
            })
          }
        />
      );
    } else {
      const groupMatch = currentMatch as GroupMatch;
      return (
        <GroupMatchCard
          key={groupMatch.id}
          group={groupMatch}
          destinationId={destinationId || lastSearchData?.destination || ""}
          currentUserId={currentUserId || ""}
          onInterested={() => onJoinGroup(groupMatch.id)}
          onSkip={() => onPassGroup(groupMatch.id)}
          onViewGroup={onViewGroup}
          onReportClick={() =>
            setReportDialogState({
              open: true,
              targetType: "group",
              targetId: groupMatch.id,
              targetName: groupMatch.name,
            })
          }
        />
      );
    }
  };

  // If we're currently loading, show only the loading state and hide everything else
  if (searchLoading) {
    return (
      <div className="w-full h-full min-h-[90vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner variant="spinner" size="md" color="primary" />
          <p className="text-muted-foreground text-sm font-medium">
            Finding matches...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-[930px]:min-h-[90vh] flex flex-col overflow-hidden">
      {/* Error Display */}
      {searchError && (
        <div className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
            <p className="text-destructive text-sm font-medium">
              {searchError}
            </p>
          </div>
        </div>
      )}

      {/* Results Display */}
      {matchedGroups.length > 0 ? (
        <div className="flex-1 relative flex items-center justify-center p-5 md:p-6">
          {/* Navigation arrows */}
          {/* {matchedGroups.length > 1 && (
            <>
              <button
                onClick={onPreviousGroup}
                disabled={currentGroupIndex === 0}
                className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-20 bg-background/95 backdrop-blur-sm border border-border rounded-full p-2.5 md:p-3 hover:bg-background hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:scale-105"
                aria-label="Previous match"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-foreground"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                onClick={onNextGroup}
                disabled={currentGroupIndex === matchedGroups.length - 1}
                className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-20 bg-background/95 backdrop-blur-sm border border-border rounded-full p-2.5 md:p-3 hover:bg-background hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:scale-105"
                aria-label="Next match"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-foreground"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          )} */}

          {/* Match Card - Direct display without extra wrapper */}
          <div className="w-full h-full">
            <MatchCardComponent />
          </div>

          {/* Match counter */}
          {/* {matchedGroups.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-sm border border-border rounded-full text-sm shadow-sm">
              <span className="font-semibold text-foreground">
                {currentGroupIndex + 1}
              </span>
              <span className="text-muted-foreground">of</span>
              <span className="font-semibold text-foreground">
                {matchedGroups.length}
              </span>
              <span className="text-muted-foreground">
                {activeTab === 0 ? "travelers" : "groups"}
              </span>
            </div>
          )} */}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 md:p-8 lg:p-12">
          <div className="text-center max-w-lg w-full border-none shadow-none min-h-[70vh] min-[930px]:min-h-0 flex flex-col justify-center items-center">
            {lastSearchData ? (
              <>
                <h3 className="sm:text-md text-sm font-semibold text-foreground mb-2">
                  {lastSearchData.destination 
                    ? `No one's heading to ${lastSearchData.destination.split(",")[0].trim()} yet.`
                    : "No travelers found for these filters."
                  }
                </h3>
                <p className="text-muted-foreground sm:text-sm text-xs leading-relaxed mb-4">
                  You're in the first batch of Kovari — 
                  more travelers are joining every week.
                </p>
                {onSearchWithoutDestination && (
                  <button
                    onClick={() => {
                      onSearchWithoutDestination();
                    }}
                    className="text-primary text-xs underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    Browse all travelers instead →
                  </button>
                )}
              </>
            ) : (
              <>
                <h3 className="sm:text-md text-sm font-medium text-foreground mb-2">
                  Finding travelers...
                </h3>
                <p className="text-muted-foreground sm:text-sm text-xs leading-relaxed">
                  Looking for compatible travel companions for you.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <ReportDialog
        open={reportDialogState.open}
        onOpenChange={(open) =>
          setReportDialogState((prev) => ({ ...prev, open }))
        }
        targetType={reportDialogState.targetType}
        targetId={reportDialogState.targetId}
        targetName={reportDialogState.targetName}
        onSubmit={async (
          reason,
          evidenceUrl,
          evidencePublicId,
          additionalNotes,
        ) => {
          if (!currentUserId) return false;

          const result = await createReportRecord(
            currentUserId,
            reportDialogState.targetId,
            reason,
            activeTab === 0 ? "solo" : "group",
            evidenceUrl,
            evidencePublicId,
          );

          if (!result.success) {
            console.error("Failed to submit report:", result.error);
            toast({
              title: "Error",
              description: result.error || "Failed to submit report",
              variant: "destructive",
            });
            throw new Error(result.error || "Failed to submit report");
          }

          // Toast removed - handled within ReportDialog UI

          // Skip to the next match
          if (activeTab === 0) {
            onPass(reportDialogState.targetId);
          } else {
            onPassGroup(reportDialogState.targetId);
          }

          return true;
        }}
      />
    </div>
  );
};

