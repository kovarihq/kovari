// -----------------------------------------------------------------------------
//   File : Group Match Card Component
// -----------------------------------------------------------------------------
// Location: /src/features/explore/components/GroupMatchCard.tsx

"use client";

import React, { useState, useEffect } from "react";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Users,
  MapPin,
  Calendar,
  MessageCircle,
  Loader2,
  Globe,
  Star,
  UserCircle2,
  Users2,
  Heart,
  Flag,
  AlertCircle,
  X,
  Check,
  IndianRupee,
  Cigarette,
  Wine as Glass,
} from "lucide-react";
import { Spinner } from "@heroui/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  createGroupInterest,
  createSkipRecord,
  createReportRecord,
} from "../lib/matchingActions";
import { getFeedImageUrl } from "@kovari/utils";
import { useReportStatus } from "@/shared/hooks/useReportStatus";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";

interface GroupMatchCardProps {
  group: any;
  destinationId: string;
  currentUserId: string;
  onInterested?: (groupId: string, destinationId: string) => Promise<void>;
  onSkip?: (groupId: string, destinationId: string) => Promise<void>;
  onViewGroup?: (groupId: string) => void;
  onReport?: (groupId: string, reason: string) => Promise<void>;
  onReportClick?: () => void;
}

export function GroupMatchCard({
  group,
  destinationId,
  currentUserId,
  onInterested,
  onSkip,
  onViewGroup,
  onReport,
  onReportClick,
}: GroupMatchCardProps) {
  const [isInteresting, setIsInteresting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [isReporting, setIsReporting] = useState(false);
  const [isViewingGroup, setIsViewingGroup] = useState(false);

  const { hasReported, setHasReported } = useReportStatus(group?.id, "group");
  const [activeTab, setActiveTab] = useState<"left" | "right">("left");

  useEffect(() => {
    if (group?.creatorId) {
      fetch("/api/profile-impressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewedUserId: group.creatorId,
          destinationId: destinationId || "Global",
        }),
      }).catch((err) => console.error("Error tracking profile impression:", err));
    }
  }, [group?.creatorId, destinationId]);

  const isPreferNotToSay = (val?: string) => {
    if (!val) return false;
    const clean = val.toLowerCase().replace(/_/g, " ");
    return clean === "prefer not to say";
  };

  const getDestinationDisplay = (dest: any): string => {
    const target = dest || group.locationDisplay;
    if (!target) return "";
    const name = typeof target === "object" && target.name 
      ? target.name 
      : (typeof target === "string" ? target : "");
    return name.split(",")[0]?.trim() ?? name;
  };

  // Add error boundary for missing group data
  if (!group) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No group data
          </h3>
          <p className="text-gray-600">Please try searching again.</p>
        </div>
      </div>
    );
  }

  const handleJoinGroup = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (interestSent) return;

    setInterestSent(true);

    // 🚀 INSTANT-FIRST: Advance to the next match immediately
    if (onInterested) {
      onInterested(group.id, destinationId);
    }

    try {
      // Validate IDs for background sync
      if (!currentUserId || !group?.id) {
        console.warn("handleJoinGroup background sync skipped: missing IDs", {
          currentUserId,
          groupId: group?.id,
        });
        return;
      }

      // Fire and forget the network request in the background
      createGroupInterest(
        currentUserId,
        group.id,
        destinationId || "Global",
      ).catch((err) => {
        console.error("Background group interest sync failed:", err);
      });

    } catch (error) {
      console.error("Unexpected error in handleJoinGroup:", error);
    }
  };

  const handleSkip = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 🚀 INSTANT-FIRST: Advance to the next match immediately
    if (onSkip) {
      onSkip(group.id, destinationId);
    }

    try {
      // Validate IDs only for the background recording
      if (!currentUserId || !group?.id) {
        console.warn("handleSkip background sync skipped: missing IDs", {
          currentUserId,
          groupId: group?.id,
        });
        return;
      }

      // Fire and forget the network request in the background
      createSkipRecord(
        currentUserId,
        group.id,
        destinationId || "Global",
        "group",
      ).catch((err) => {
        console.error("Background skip sync failed:", err);
      });

    } catch (error) {
      console.error("Unexpected error in handleSkip:", error);
    }
  };

  const handleViewGroup = () => {
    setIsViewingGroup(true);
    if (onViewGroup) {
      onViewGroup(group.id);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;

    setIsReporting(true);
    try {
      // Use provided handler or fall back to default action
      if (onReport) {
        await onReport(group.id, reportReason);
      } else {
        const result = await createReportRecord(
          currentUserId,
          group.id,
          reportReason,
          "group",
        );
        if (!result.success) {
          console.error("Failed to report:", result.error);
          setIsReporting(false);
          return;
        }
      }
      setShowReportDialog(false);
      setReportReason("");
      setHasReported(true); // Optimistically update state
    } catch (error) {
      console.error("Error reporting group:", error);
    } finally {
      setIsReporting(false);
    }
  };

  const formatDateRange = () => {
    if (!group.startDate && !group.endDate) return "Dates TBD";

    try {
      // Handle both string dates and Date objects
      const startDate = group.startDate
        ? typeof group.startDate === "string"
          ? new Date(group.startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : group.startDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
        : "TBD";

      const endDate = group.endDate
        ? typeof group.endDate === "string"
          ? new Date(group.endDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : group.endDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
        : "TBD";

      return `${startDate} - ${endDate}`;
    } catch (error) {
      console.error("Error formatting dates:", error);
      return "Dates TBD";
    }
  };

  const getTripLengthDays = () => {
    if (!group.startDate || !group.endDate) return null;

    try {
      // Handle both string dates and Date objects
      const start =
        typeof group.startDate === "string"
          ? new Date(group.startDate).getTime()
          : group.startDate.getTime();
      const end =
        typeof group.endDate === "string"
          ? new Date(group.endDate).getTime()
          : group.endDate.getTime();

      if (isNaN(start) || isNaN(end) || end < start) return null;
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return days;
    } catch (error) {
      console.error("Error calculating trip length:", error);
      return null;
    }
  };

  const getPrivacyIcon = (privacy?: string) => {
    switch (privacy?.toLowerCase()) {
      case "public":
        return <Globe />;
      case "private":
        return <Users2 />;
      default:
        return <Globe />;
    }
  };

  const formatSmokingPolicy = (p?: string) => {
    if (!p || isPreferNotToSay(p)) return null;
    const s = p.toLowerCase();
    if (s === "non-smoking") return "No smoking";
    if (s === "smokers welcome") return "Smoking allowed";
    return "Smoking allowed";
  };

  const formatDrinkingPolicy = (p?: string) => {
    if (!p || isPreferNotToSay(p)) return null;
    const s = p.toLowerCase();
    if (s === "non-drinking") return "No alcohol";
    if (s === "drinkers welcome") return "Alcohol allowed";
    return "Alcohol allowed";
  };

  // Derived display values for Bumble-like sections
  const creatorDisplayName = group.creator?.name && group.creator.name !== "Unknown" 
    ? group.creator.name 
    : (group.creator?.username && group.creator.username !== "unknown" ? `@${group.creator.username}` : null);

  const aboutText = (() => {
    const parts: string[] = [];
    if (creatorDisplayName) parts.push(`Created by ${creatorDisplayName}`);
    if (group.memberCount) parts.push(`${group.memberCount} members`);
    if (group.destination) {
      const destName = typeof group.destination === "object" && group.destination?.name 
        ? group.destination.name 
        : (typeof group.destination === "string" ? group.destination : "");
      if (destName) {
        parts.push(`Traveling to ${destName}`);
      }
    }
    return parts.length > 0
      ? parts.join(". ") + "."
      : "Join this amazing travel group!";
  })();

  const travelStyleTags = (() => {
    const candidates = [
      "cultural",
      "foodie",
      "photography",
      "adventure",
      "nature",
      "nightlife",
      "history",
      "beach",
    ];
    const interests = (group.tags || []).map((i: string) => i.toLowerCase());
    const filtered = interests.filter((i: string) => candidates.includes(i));
    const tags = (filtered.length > 0 ? filtered : interests).slice(0, 3);
    return tags;
  })();

  // Pill component helper - modern SaaS styling (matches SoloMatchCard)
  const Pill = ({
    icon,
    text,
    variant = "default",
    className = "",
  }: {
    icon?: React.ReactNode;
    text: string;
    variant?: "default" | "highlight";
    className?: string;
  }) => (
    <span
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm bg-secondary text-foreground border border-border ${className}`}
    >
      {icon && (
        <span className="flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0 [&_svg]:text-current">
          {icon}
        </span>
      )}
      <span>{text}</span>
    </span>
  );

  return (
    <div className="w-full h-full flex flex-col flex-1 min-h-0 md:overflow-y-auto relative">
      {/* Loading overlay for View Group */}
      {isViewingGroup && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-card">
          <Spinner variant="spinner" size="md" color="primary" />
        </div>
      )}

      {/* ============================================================== */}
      {/* MOBILE VIEW (Screens smaller than md) */}
      {/* ============================================================== */}
      <div className="md:hidden flex flex-col w-full h-full flex-1 min-h-0 overflow-hidden p-5">
        {/* Story Indicators */}
        <div className="flex gap-2 px-0 pt-0 w-full shrink-0">
          <div
            className={`h-1 flex-1 rounded-full transition-colors cursor-pointer ${
              activeTab === "left" ? "bg-muted dark:bg-muted-foreground" : "bg-secondary"
            }`}
            onClick={() => setActiveTab("left")}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors cursor-pointer ${
              activeTab === "right" ? "bg-muted dark:bg-muted-foreground" : "bg-secondary"
            }`}
            onClick={() => setActiveTab("right")}
          />
        </div>

        {/* Header Section */}
        {activeTab === "left" ? (
          /* Left Header: Group Name and Description */
          <div className="flex-none pt-3 pb-3">
            <h1 className="text-md font-extrabold text-foreground tracking-tight flex items-center gap-2">
              {group.name || "Travel Group"}
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex flex-wrap gap-1 leading-normal mt-0">
              {group.description || "No description provided."}
            </p>
          </div>
        ) : (
          /* Right Header: Creator's Name, Age, City */
          <div className="flex-none pt-3 pb-3">
            <h1 className="text-md font-extrabold text-foreground tracking-tight flex items-center gap-2">
              Created by {group.creator?.name || "Traveler"}
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex flex-wrap gap-1 mt-0">
              {group.creator?.age ? `${group.creator.age}, ` : ""} {typeof group.creator?.location === 'string' ? group.creator.location.split(',')[0].trim() : "Unknown"}
            </p>
          </div>
        )}

        {/* Scrollable Active Tab Content */}
        <div className="flex-grow overflow-y-auto overflow-x-hidden flex flex-col px-0 scrollbar-none">

          {activeTab === "left" ? (
            /* LEFT TAB CONTENT */
            <div className="flex flex-col">
              {/* Group Cover Image */}
              <div className="w-full max-w-[400px] aspect-[4/3] rounded-2xl overflow-hidden bg-secondary shadow-none border border-border mb-4">
                {group.cover_image || group.image ? (
                  <img
                    src={getFeedImageUrl(group.cover_image || group.image)}
                    alt={group.name || "Travel Group"}
                    className="w-full h-full object-cover cursor-pointer"
                  />
                ) : (
                  <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                    <AvatarImage src="" />
                    <UserAvatarFallback iconClassName="h-24 w-24" />
                  </Avatar>
                )}
              </div>

              {/* Trip Details Section */}
              <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col mb-4">
                <p className="text-sm font-semibold text-foreground">
                  {getDestinationDisplay(group.destination)}
                  {(group.averageBudget != null || group.budget != null) && (
                    <>
                      <span className="mx-2 text-muted-foreground">•</span>
                      ₹{Number(group.averageBudget || group.budget).toLocaleString("en-IN")}
                    </>
                  )}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {formatDateRange()}
                </p>
              </div>

              {/* Match Score Section */}
              {/* {group.score !== undefined && (
                <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col mb-4">
                  <p className="text-sm font-semibold text-foreground font-bold">
                    {Math.round(group.score * 100)}% compatibility
                  </p>
                  {group.breakdown && (
                    <p className="text-sm font-semibold text-foreground flex flex-wrap items-center">
                      {(() => {
                        const items = [
                          group.breakdown.budget != null && `Budget: ${Math.round(group.breakdown.budget * 100)}%`,
                          group.breakdown.dates != null && `Dates: ${Math.round(group.breakdown.dates * 100)}%`,
                          group.breakdown.interests != null && `Interests: ${Math.round(group.breakdown.interests * 100)}%`,
                          group.breakdown.age != null && `Age: ${Math.round(group.breakdown.age * 100)}%`
                        ].filter(Boolean);
                        
                        return items.map((item, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                            <span>{item}</span>
                          </React.Fragment>
                        ));
                      })()}
                    </p>
                  )}
                </div>
              )} */}

              {/* Group Members Section */}
              {(() => {
                const items = [
                  creatorDisplayName && `Created by ${creatorDisplayName}`,
                  group.memberCount != null && `${group.memberCount} members`
                ].filter(Boolean);
                if (items.length === 0) return null;
                return (
                  <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col mb-4">
                    <p className="text-sm font-semibold text-foreground flex flex-wrap items-center">
                      {items.map((item, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                          <span>{item}</span>
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                );
              })()}

              {/* Group Interests Section */}
              {group.tags && group.tags.length > 0 && (
                <div className="bg-secondary rounded-2xl p-3 flex flex-wrap items-center gap-y-1 mb-4">
                  {group.tags.slice(0, 6).map((tag: string, idx: number) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                      <span className="text-sm font-semibold text-foreground">
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Languages Section */}
              {group.languages && group.languages.length > 0 && (
                <div className="bg-secondary rounded-2xl p-3 flex flex-wrap items-center gap-y-1 mb-4">
                  {group.languages.map((lang: string, idx: number) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                      <span className="text-sm font-semibold text-foreground">
                        {lang}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Lifestyle Section */}
              {(
                (group.smokingPolicy && !isPreferNotToSay(group.smokingPolicy)) ||
                (group.drinkingPolicy && !isPreferNotToSay(group.drinkingPolicy))
              ) && (
                <div className="bg-secondary rounded-2xl p-3 flex flex-wrap items-center gap-y-1">
                  {(() => {
                    const smokingVal = formatSmokingPolicy(group.smokingPolicy);
                    const drinkingVal = formatDrinkingPolicy(group.drinkingPolicy);
                    
                    const items = [
                      smokingVal && !isPreferNotToSay(smokingVal) && `Smoking: ${smokingVal}`,
                      drinkingVal && !isPreferNotToSay(drinkingVal) && `Drinking: ${drinkingVal}`
                    ].filter(Boolean) as string[];
                    
                    return items.map((item, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                        <span className="text-sm font-semibold text-foreground">
                          {item}
                        </span>
                      </React.Fragment>
                    ));
                  })()}
                </div>
              )}
            </div>
          ) : (
            /* RIGHT TAB CONTENT */
            <div className="flex flex-col">
              {/* Creator's Avatar */}
              <div className="w-full max-w-[400px] aspect-[4/3] rounded-2xl overflow-hidden bg-secondary shadow-none border border-border mb-4">
                {group.creator?.avatar ? (
                  <img
                    src={getFeedImageUrl(group.creator.avatar)}
                    alt={group.creator?.name || "Group Creator"}
                    className="w-full h-full object-cover cursor-pointer"
                  />
                ) : (
                  <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                    <AvatarImage src="" />
                    <UserAvatarFallback iconClassName="h-24 w-24" />
                  </Avatar>
                )}
              </div>

              {/* Creator About Section */}
              {(() => {
                const hasGender = group.creator?.gender && !isPreferNotToSay(group.creator.gender);
                const creatorProf = group.creator?.profession;
                const creatorRel = group.creator?.religion;
                const creatorPers = group.creator?.personality;
                const detailItems = [
                  creatorProf && !isPreferNotToSay(creatorProf) && (creatorProf.charAt(0).toUpperCase() + creatorProf.slice(1)),
                  creatorRel && !isPreferNotToSay(creatorRel) && (creatorRel.charAt(0).toUpperCase() + creatorRel.slice(1)),
                  creatorPers && !isPreferNotToSay(creatorPers) && (creatorPers.charAt(0).toUpperCase() + creatorPers.slice(1))
                ].filter(Boolean) as string[];
                const hasLanguages = group.creator?.languages && Array.isArray(group.creator.languages) && group.creator.languages.length > 0;

                if (!hasGender && detailItems.length === 0 && !hasLanguages) return null;

                return (
                  <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col mb-4">
                    {hasGender && (
                      <p className="text-sm font-semibold text-foreground">
                        {group.creator.gender.charAt(0).toUpperCase() + group.creator.gender.slice(1)}
                      </p>
                    )}
                    {detailItems.length > 0 && (
                      <p className="text-sm font-semibold text-foreground flex flex-wrap items-center">
                        {detailItems.map((item, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                            <span>{item}</span>
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                    {hasLanguages && (
                      <p className="text-sm font-semibold text-foreground">
                        {group.creator.languages.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Creator Interests Section */}
              {group.creator?.interests && group.creator.interests.length > 0 && (
                <div className="bg-secondary rounded-2xl p-3 flex flex-wrap items-center gap-y-1 mb-4">
                  {group.creator.interests.map((interest: string, idx: number) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                      <span className="text-sm font-semibold text-foreground">
                        {interest.charAt(0).toUpperCase() + interest.slice(1)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Creator Lifestyle Section */}
              {(
                (group.creator?.foodPreference && !isPreferNotToSay(group.creator.foodPreference)) ||
                (group.creator?.smoking && !isPreferNotToSay(group.creator.smoking)) ||
                (group.creator?.drinking && !isPreferNotToSay(group.creator.drinking))
              ) && (
                <div className="bg-secondary rounded-2xl p-3 flex flex-wrap items-center gap-y-1 mb-4">
                  {(() => {
                    const creatorFood = group.creator.foodPreference;
                    const creatorSmoking = group.creator.smoking;
                    const creatorDrinking = group.creator.drinking;

                    const foodText = creatorFood && !isPreferNotToSay(creatorFood)
                      ? String(creatorFood)
                          .replace(/_/g, " ")
                          .charAt(0)
                          .toUpperCase() +
                        String(creatorFood)
                          .replace(/_/g, " ")
                          .slice(1)
                      : null;

                    const smokingVal = creatorSmoking && !isPreferNotToSay(creatorSmoking)
                      ? (creatorSmoking === "no"
                          ? "No"
                          : creatorSmoking === "yes"
                          ? "Yes"
                          : String(creatorSmoking).replace(/_/g, " "))
                      : null;
                    const smokingText = smokingVal ? `Smoking: ${smokingVal.charAt(0).toUpperCase() + smokingVal.slice(1)}` : null;

                    const drinkingVal = creatorDrinking && !isPreferNotToSay(creatorDrinking)
                      ? (creatorDrinking === "no"
                          ? "No"
                          : creatorDrinking === "yes"
                          ? "Yes"
                          : String(creatorDrinking).replace(/_/g, " "))
                      : null;
                    const drinkingText = drinkingVal ? `Drinking: ${drinkingVal.charAt(0).toUpperCase() + drinkingVal.slice(1)}` : null;

                    const items = [foodText, smokingText, drinkingText].filter(Boolean) as string[];

                    return items.map((item, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                        <span className="text-sm font-semibold text-foreground">
                          {item}
                        </span>
                      </React.Fragment>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Action Buttons */}
        <div className="flex pt-5 gap-3 shrink-0">
          <Button
            variant="default"
            className="flex-1 h-12 rounded-2xl text-sm font-bold bg-primary text-primary-foreground shadow-sm flex flex-row items-center justify-center gap-1 border-0"
            onClick={handleJoinGroup}
            disabled={isInteresting || interestSent}
          >
            {isInteresting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : interestSent ? (
              "Sent"
            ) : (
              <>
                <span>Interested</span>
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 h-12 rounded-2xl text-sm font-bold bg-secondary text-foreground shadow-sm flex flex-row items-center justify-center gap-1 border border-border"
            onClick={handleSkip}
            disabled={isSkipping}
          >
            {isSkipping ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span>Skip</span>
              </>
            )}
          </Button>
        </div>
      </div>

         {/* ============================================================== */}
      {/* DESKTOP VIEW */}
      {/* ============================================================== */}
      <div key={group.id} className="hidden md:flex flex-col flex-grow h-full justify-between gap-5">
        <div className="flex flex-col gap-4 flex-grow">
          {/* Header block with Group Name, Description */}
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-foreground">
              {group.name || "Travel Group"}
            </h1>
            {group.description && (
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                {group.description}
              </p>
            )}
            {!group.description && (
              <p className="text-sm text-muted-foreground mt-0 font-medium">
                No description provided.
              </p>
            )}
          </div>

          {/* Columns Section */}
          <div className="flex flex-col md:flex-row items-stretch gap-5 flex-grow">
            {/* Left Column: Cover Image, Creator Details, Compatibility, Highlight Tags */}
            <div className="flex flex-col gap-5 w-full md:w-56 shrink-0">
              <div className="w-full aspect-square md:w-56 md:h-56 rounded-2xl overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0 relative shadow-none border border-border">
                {group.cover_image || group.image ? (
                  <img
                    src={getFeedImageUrl(group.cover_image || group.image)}
                    alt={group.name || "Travel Group"}
                    className="w-full h-full object-cover cursor-pointer"
                  />
                ) : (
                  <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                    <AvatarImage src="" alt={group.name || "Travel Group"} />
                    <UserAvatarFallback iconClassName="h-24 w-24" />
                  </Avatar>
                )}
              </div>

              {/* Creator details card just like solo match card */}
              <div className="flex flex-col gap-3 flex-grow md:flex-1">
                <div className="flex flex-col px-1">
                  <h3 className="text-sm font-bold text-foreground">
                    Created by {group.creator?.name || "Traveler"}
                  </h3>
                  {/* <p className="text-sm text-muted-foreground font-medium">
                    {group.creator?.age ? `${group.creator.age}, ` : ""}
                    {typeof group.creator?.location === 'string'
                      ? group.creator.location.split(',')[0].trim()
                      : "Unknown"}
                  </p> */}
                </div>
                <div className="w-full rounded-2xl overflow-hidden bg-secondary flex items-center justify-center relative shadow-none border border-border flex-grow md:flex-1 min-h-[200px]">
                  {group.creator?.avatar ? (
                    <img
                      src={getFeedImageUrl(group.creator.avatar)}
                      alt={group.creator?.name || "Group Creator"}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                  ) : (
                    <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                      <AvatarImage src="" alt={group.creator?.name || "Group Creator"} />
                      <UserAvatarFallback iconClassName="h-24 w-24" />
                    </Avatar>
                  )}
                </div>
              </div>

              {/* Match Score & Tags */}
              {/* <div className="flex flex-col flex-1 w-full">
                {group.score !== undefined && (
                  <div className="flex items-baseline gap-1.5 mb-5 flex-shrink-0">
                    <h2 className="text-xl font-bold text-foreground tracking-tighter leading-none">
                      {Math.round(group.score * 100)}%
                    </h2>
                    <p className="text-md font-semibold text-foreground tracking-tight leading-none">
                      compatibility
                    </p>
                  </div>
                )}
                {group.tags && group.tags.length > 0 && (
                  <div className="bg-secondary rounded-2xl p-6 flex flex-wrap content-start items-start gap-y-1.5 w-full flex-1">
                    {group.tags.slice(0, 4).map((tag: string, idx: number) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="mx-1.5 text-muted-foreground">•</span>}
                        <span className="text-sm font-semibold text-foreground">
                          {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div> */}
            </div>

            {/* Right Column: Travel Details, About, Languages, Lifestyle in flex */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
              {(() => {
                const cards = [];

                // 1. Trip Details Container
                cards.push(
                  <div key="trip" className="space-y-1.5 bg-secondary rounded-2xl p-6 flex flex-col w-full">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Trip Details</h3>
                    <p className="text-sm font-semibold text-foreground capitalize">
                      {getDestinationDisplay(group.destination)}
                      {group.budget != null && (
                        <>
                          <span className="mx-2 text-muted-foreground">•</span>
                          ₹{Number(group.budget).toLocaleString("en-IN")}
                        </>
                      )}
                    </p>
                    <p className="text-sm font-semibold text-foreground capitalize">
                      {formatDateRange()}
                    </p>
                  </div>
                );

                // 2. About Section
                // cards.push(
                //   <div key="about" className="space-y-1.5 bg-secondary rounded-2xl p-6 flex flex-col w-full">
                //     <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">About Group</h3>
                //     <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                //       {(() => {
                //         const items = [
                //           creatorDisplayName && `Created by ${creatorDisplayName}`,
                //           group.memberCount != null && `${group.memberCount} members`,
                //           group.privacy && (group.privacy.charAt(0).toUpperCase() + group.privacy.slice(1))
                //         ].filter(Boolean);

                //         return items.map((item, idx) => (
                //           <React.Fragment key={idx}>
                //             {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                //             <span>{item}</span>
                //           </React.Fragment>
                //         ));
                //       })()}
                //     </div>
                //   </div>
                // );

                // 2.5 Creator About Details
                const creatorGender = group.creator?.gender || (group.creator as any)?.Gender;
                const creatorProfession = group.creator?.profession || (group.creator as any)?.Profession;
                const creatorReligion = group.creator?.religion || (group.creator as any)?.Religion;
                const creatorPersonality = group.creator?.personality || (group.creator as any)?.Personality;
                const creatorLanguages = Array.isArray(group.creator?.languages) ? group.creator.languages : [];

                const hasCreatorAbout = (creatorGender && !isPreferNotToSay(creatorGender)) ||
                  (creatorProfession && !isPreferNotToSay(creatorProfession)) ||
                  (creatorReligion && !isPreferNotToSay(creatorReligion)) ||
                  (creatorPersonality && !isPreferNotToSay(creatorPersonality)) ||
                  creatorLanguages.length > 0;

                if (hasCreatorAbout) {
                  const creatorItems = [
                    creatorGender && !isPreferNotToSay(creatorGender) && (creatorGender.charAt(0).toUpperCase() + creatorGender.slice(1)),
                    creatorProfession && !isPreferNotToSay(creatorProfession) && (creatorProfession.charAt(0).toUpperCase() + creatorProfession.slice(1)),
                    creatorReligion && !isPreferNotToSay(creatorReligion) && (creatorReligion.charAt(0).toUpperCase() + creatorReligion.slice(1)),
                    creatorPersonality && !isPreferNotToSay(creatorPersonality) && (creatorPersonality.charAt(0).toUpperCase() + creatorPersonality.slice(1))
                  ].filter(Boolean) as string[];

                  cards.push(
                    <div key="creator-about" className="space-y-1.5 bg-secondary rounded-2xl p-6 flex flex-col w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">About Creator</h3>
                      {creatorItems.length > 0 && (
                        <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                          {creatorItems.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                              <span>{item}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      {creatorLanguages.length > 0 && (
                        <div className="text-sm font-semibold text-foreground mt-1 text-left">
                          {creatorLanguages.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                }

                // 2.6 Creator Interests
                const creatorInterests = group.creator?.interests || [];
                if (creatorInterests.length > 0) {
                  cards.push(
                    <div key="creator-interests" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Creator Interests</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {creatorInterests.map((interest: string, idx: number) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                            <span className="text-sm font-semibold text-foreground">
                              {interest.charAt(0).toUpperCase() + interest.slice(1)}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 2.7 Creator Lifestyle
                const creatorFood = group.creator?.foodPreference;
                const creatorSmoking = group.creator?.smoking;
                const creatorDrinking = group.creator?.drinking;

                const hasCreatorLifestyle = (creatorFood && !isPreferNotToSay(creatorFood)) ||
                  (creatorSmoking && !isPreferNotToSay(creatorSmoking)) ||
                  (creatorDrinking && !isPreferNotToSay(creatorDrinking));

                if (hasCreatorLifestyle) {
                  cards.push(
                    <div key="creator-lifestyle" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Creator Lifestyle</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {(() => {
                          const foodText = creatorFood && !isPreferNotToSay(creatorFood)
                            ? String(creatorFood)
                                .replace(/_/g, " ")
                                .charAt(0)
                                .toUpperCase() +
                              String(creatorFood)
                                .replace(/_/g, " ")
                                .slice(1)
                            : null;

                          const smokingVal = creatorSmoking && !isPreferNotToSay(creatorSmoking)
                            ? (creatorSmoking === "no"
                                ? "No"
                                : creatorSmoking === "yes"
                                ? "Yes"
                                : String(creatorSmoking).replace(/_/g, " "))
                            : null;
                          const smokingText = smokingVal ? `Smoking: ${smokingVal.charAt(0).toUpperCase() + smokingVal.slice(1)}` : null;

                          const drinkingVal = creatorDrinking && !isPreferNotToSay(creatorDrinking)
                            ? (creatorDrinking === "no"
                                ? "No"
                                : creatorDrinking === "yes"
                                ? "Yes"
                                : String(creatorDrinking).replace(/_/g, " "))
                            : null;
                          const drinkingText = drinkingVal ? `Drinking: ${drinkingVal.charAt(0).toUpperCase() + drinkingVal.slice(1)}` : null;

                          const items = [foodText, smokingText, drinkingText].filter(Boolean) as string[];

                          return items.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                              <span className="text-sm font-semibold text-foreground">
                                {item}
                              </span>
                            </React.Fragment>
                          ));
                        })()}
                      </div>
                    </div>
                  );
                }

                // 3. Languages Section
                if (group.languages && group.languages.length > 0) {
                  cards.push(
                    <div key="languages" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Languages</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {group.languages.map((lang: string, idx: number) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                            <span className="text-sm font-semibold text-foreground">
                              {lang}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 4. Lifestyle Section
                const smokingVal = formatSmokingPolicy(group.smokingPolicy);
                const drinkingVal = formatDrinkingPolicy(group.drinkingPolicy);
                const hasLifestyle = (smokingVal && !isPreferNotToSay(smokingVal)) ||
                  (drinkingVal && !isPreferNotToSay(drinkingVal));

                if (hasLifestyle) {
                  cards.push(
                    <div key="lifestyle" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lifestyle</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {(() => {
                          const items = [
                            smokingVal && `Smoking: ${smokingVal}`,
                            drinkingVal && `Drinking: ${drinkingVal}`
                          ].filter(Boolean) as string[];

                          return items.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                              <span className="text-sm font-semibold text-foreground">
                                {item}
                              </span>
                            </React.Fragment>
                          ));
                        })()}
                      </div>
                    </div>
                  );
                }

                return cards.map((card, idx) => {
                  const isLast = idx === cards.length - 1;
                  if (isLast) {
                    return React.cloneElement(card, {
                      className: `${card.props.className || ""} flex-grow`,
                    });
                  }
                  return card;
                });
              })()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-row gap-5 mt-auto">
          {/* 1. Skip Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSkip}
            disabled={isSkipping}
            className="flex-1 h-12 rounded-2xl text-foreground bg-secondary border border-border"
          >
            {isSkipping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <X className="w-5 h-5 md:hidden shrink-0" aria-hidden />
                <span className="hidden md:inline text-md font-semibold">Skip</span>
              </>
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleJoinGroup}
            disabled={isInteresting || interestSent}
            className="order-first md:order-none flex-1 h-12 rounded-2xl"
          >
            {isInteresting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : interestSent ? (
              <>
                <Heart
                  className="w-5 h-5 fill-current md:hidden shrink-0"
                  aria-hidden
                />
                <span className="hidden md:inline text-xs ml-1">Sent</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5 md:hidden shrink-0" aria-hidden />
                <span className="hidden md:inline text-md font-semibold">
                  Interested
                </span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Report Group
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Help us keep Kovari safe. Please select a reason for reporting
              this group.
            </p>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Reason
              </label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fake_group">Fake group</SelectItem>
                  <SelectItem value="inappropriate_content">
                    Inappropriate content
                  </SelectItem>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="harassment">Harassment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowReportDialog(false);
                setReportReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReport}
              disabled={!reportReason || isReporting}
            >
              {isReporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Reporting...
                </>
              ) : (
                "Report"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

