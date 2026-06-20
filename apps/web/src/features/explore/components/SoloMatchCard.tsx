// -----------------------------------------------------------------------------
//   File : Solo Match Card Component
// -----------------------------------------------------------------------------
// Location: /src/features/explore/components/SoloMatchCard.tsx

"use client";

import React, { useState } from "react";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  MapPin,
  Calendar,
  User,
  Heart,
  Loader2,
  Briefcase,
  GraduationCap,
  Flag,
  Zap,
  BookOpen,
  CircleDot,
  MessageCircle,
  UserCircle2,
  Beer,
  Wine,
  Cigarette,
  Wine as Glass,
  DollarSign,
  AlertCircle,
  ThumbsDown,
  Eye,
  X,
  Check,
  Home,
  Salad,
  BookMarked,
  IndianRupee,
  Globe,
  Plus,
  SkipForward,
} from "lucide-react";
import { Spinner } from "@heroui/react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { getFeedImageUrl } from "@kovari/utils";
import { useReportStatus } from "@/shared/hooks/useReportStatus";
import {
  createSoloInterest,
  createSkipRecord,
  createReportRecord,
} from "../lib/matchingActions";

interface SoloMatchCardProps {
  match: {
    id: string;
    name: string;
    destination: string;
    budget: string;
    start_date: Date;
    end_date: Date;
    compatibility_score: number;
    budget_difference: string;
    user: {
      userId: string;
      full_name?: string;
      name?: string;
      age?: number;
      gender?: string;
      personality?: string;
      interests?: string[];
      profession?: string;
      avatar?: string;
      nationality?: string;
      smoking?: string;
      drinking?: string;
      religion?: string;
      languages?: string[];
      location?: { lat: number; lon: number };
      locationDisplay?: string;
      foodPreference?: string;
      bio?: string;
      travel_intentions?: any[];
      travelIntentions?: any[];
    };
    is_solo_match: boolean;
  };
  destinationId: string;
  currentUserId: string;
  onInterested?: (toUserId: string, destinationId: string) => Promise<void>;
  onSkip?: (skippedUserId: string, destinationId: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
  onReport?: (reportedUserId: string, reason: string) => Promise<void>;
  onReportClick?: () => void;
}

export function SoloMatchCard({
  match,
  destinationId,
  currentUserId,
  onInterested,
  onSkip,
  onViewProfile,
  onReport,
  onReportClick,
}: SoloMatchCardProps) {
  // Fallback to top-level if user object is nested incorrectly
  const user = {
    ...((match as any) || {}),
    ...(match.user || {})
  };
  const travelIntentionsRaw = 
    (match as any)?.travel_intentions || 
    (match as any)?.travelIntentions || 
    match?.user?.travel_intentions || 
    (match?.user as any)?.travelIntentions || 
    user?.travel_intentions || 
    (user as any)?.travelIntentions || 
    [];
  const travelIntentions = typeof travelIntentionsRaw === 'string'
    ? (() => { try { return JSON.parse(travelIntentionsRaw); } catch { return []; } })()
    : (Array.isArray(travelIntentionsRaw) ? travelIntentionsRaw : []);

  const hasTripDetails = !!(
    match?.destination &&
    match.destination.trim() !== "" &&
    match.destination !== "Global" &&
    match.destination !== "Any"
  );

  const isPreferNotToSay = (val?: string) => {
    if (!val) return false;
    const clean = val.toLowerCase().replace(/_/g, " ");
    return clean === "prefer not to say";
  };
  const [isInteresting, setIsInteresting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [isReporting, setIsReporting] = useState(false);
  const [isViewingProfile, setIsViewingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"left" | "right">("left");

  const { hasReported, setHasReported } = useReportStatus(user?.userId, "user");

  const handleInterested = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (interestSent) return;

    setInterestSent(true);

    // 🚀 INSTANT-FIRST: Advance to the next match immediately
    if (onInterested) {
      onInterested(user.userId || "", destinationId);
    }

    try {
      // Validate required IDs for the background recording
      if (!currentUserId || !user?.userId) {
        console.warn("handleInterested background sync skipped: missing IDs", {
          currentUserId,
          targetUserId: user?.userId,
        });
        return;
      }

      // Fire and forget the network request in the background
      createSoloInterest(
        currentUserId,
        user.userId,
        destinationId || "Global",
      ).catch((err) => {
        console.error("Background interest sync failed:", err);
      });

    } catch (error) {
      console.error("Unexpected error in handleInterested:", error);
    }
  };

  const handleSkip = (e?: React.MouseEvent) => {
    // 🛡️ EVENT PROTECTION: prevent bubbling or default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 🚀 INSTANT-FIRST: Advance to the next match immediately
    // We do this before ANY validation to ensure the UI is always responsive
    if (onSkip) {
      onSkip(user.userId || "", destinationId);
    }

    try {
      // Validate IDs only for the background recording
      if (!currentUserId || !user?.userId) {
        console.warn("handleSkip background sync skipped: missing IDs", {
          currentUserId,
          targetUserId: user?.userId,
        });
        return;
      }

      // Fire and forget the network request in the background
      createSkipRecord(
        currentUserId,
        user.userId,
        destinationId || "Global",
        "solo",
      ).catch((err) => {
        console.error("Background skip sync failed:", err);
      });

    } catch (error) {
      // Catching errors to prevent crashing the UI handler
      console.error("Unexpected error in handleSkip:", error);
    }
  };

  const handleViewProfile = () => {
    if (!user.userId || !onViewProfile) return;
    setIsViewingProfile(true);
    onViewProfile(user.userId);
  };

  const handleReport = async () => {
    if (!reportReason) return;

    setIsReporting(true);
    try {
      // Use provided handler or fall back to default action
      if (onReport) {
        await onReport(user.userId, reportReason);
      } else {
        const result = await createReportRecord(
          currentUserId,
          user.userId,
          reportReason,
          "solo",
        );
        if (!result.success) {
          console.error("Failed to report:", result.error);
          setIsReporting(false);
          return;
        }
      }
      setShowReportDialog(false);
      setReportReason("");
      setHasReported(true); // Optimistically lock UI
    } catch (error) {
      console.error("Error reporting user:", error);
    } finally {
      setIsReporting(false);
    }
  };

  const formatDateRange = () => {
    const startDate = new Date(match.start_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const endDate = new Date(match.end_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startDate} - ${endDate}`;
  };

  const getTripLengthDays = () => {
    const start = new Date(match.start_date).getTime();
    const end = new Date(match.end_date).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return null;
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return days;
  };

  const getCompatibilityColor = (score: number) => {
    if (score >= 80) return "success";
    if (score >= 60) return "warning";
    return "primary";
  };

  const getBudgetDifferenceColor = (difference: string) => {
    if (difference === "Same budget") return "success";
    if (difference.includes("+")) return "warning";
    return "primary";
  };

  const getPersonalityIcon = (personality?: string) => {
    switch (personality?.toLowerCase()) {
      case "extrovert":
        return <Zap className="w-4 h-4" />;
      case "introvert":
        return <BookOpen className="w-4 h-4" />;
      case "ambivert":
        return <CircleDot className="w-4 h-4" />;
      default:
        return <UserCircle2 className="w-4 h-4" />;
    }
  };

  const getProfessionIcon = (profession?: string) => {
    const p = profession?.toLowerCase() ?? "";
    if (
      p === "student" ||
      p.includes("student") ||
      p === "graduate" ||
      p.includes("graduate")
    )
      return <GraduationCap className="w-4 h-4" />;
    return <Briefcase className="w-4 h-4" />;
  };

  const getSmokingIcon = (smoking?: string) => {
    return (
      <Cigarette
        className="w-4 h-4 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
    );
  };

  const getDrinkingIcon = (drinking?: string) => {
    return (
      <Glass
        className="w-4 h-4 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
    );
  };

  // Derived display values for Bumble-like sections
  const aboutText = (() => {
    const parts: string[] = [];
    if (user.profession)
      parts.push(`${String(user.profession).replace(/_/g, " ")}`);
    if (user.personality) parts.push(`${String(user.personality)}`);
    if (user.interests && user.interests.length > 0) {
      parts.push(`Loves ${user.interests.slice(0, 3).join(", ")}`);
    }
    return parts.length > 0 ? parts.join(". ") + "." : "No bio provided.";
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
    const interests = (user.interests || []).map((i: string) => i.toLowerCase());
    const filtered = interests.filter((i: string) => candidates.includes(i));
    const tags = (filtered.length > 0 ? filtered : interests).slice(0, 3);
    return tags;
  })();

  const formattedProfession = user.profession
    ? String(user.profession).replace(/_/g, " ")
    : undefined;
  const languagesList = Array.isArray(user.languages) ? user.languages : [];

  // Pill component helper - modern SaaS styling with error resilience
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
  }) => {
    if (!text) return null;
    return (
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
  };

  // 🛡️ RE-DERIVE WITH DEEP FALLBACKS (Atomic Level)
  const nationality = user.nationality || (match as any).nationality || user.Nationality || (match as any).Nationality;
  const gender = user.gender || (match as any).gender || user.Gender || (match as any).Gender;
  const personality = user.personality || (match as any).personality || user.Personality || (match as any).Personality;
  const locationDisplay = user.locationDisplay || (match as any).locationDisplay || user.LocationDisplay || (match as any).LocationDisplay;
  const religion = user.religion || (match as any).religion || user.Religion || (match as any).Religion;
  const profession = user.profession || (match as any).profession || user.Profession || (match as any).Profession;

  return (
    <div className="w-full h-full flex flex-col flex-1 min-h-0 md:overflow-y-auto relative">
      {/* Loading overlay for View Profile */}
      {isViewingProfile && (
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

        {/* Name, Age, Location Header */}
        <div className="flex-none pt-3 pb-3">
          <h1 className="text-md font-extrabold text-foreground tracking-tight flex items-center gap-2">
            {user.full_name || user.name || "Traveler"}
          </h1>
          <p className="text-sm text-muted-foreground font-medium flex flex-wrap gap-1 mt-0.5">
            {user.age && `${user.age}, `} {typeof locationDisplay === 'string' ? locationDisplay.split(',')[0].trim() : "Unknown"}
          </p>
        </div>

        {/* Scrollable Active Tab Content */}
        <div className="flex-grow overflow-y-auto overflow-x-hidden flex flex-col px-0 scrollbar-none">

          {activeTab === "left" ? (
            <div className="flex flex-col">
              {/* Avatar (Centered and correctly sized) */}
                <div className="w-full max-w-[400px] aspect-[4/3] rounded-2xl overflow-hidden bg-secondary shadow-none border border-border mb-4">
                  {user.avatar ? (
                    <img
                      src={getFeedImageUrl(user.avatar)}
                      alt={user.full_name || user.name || "Traveler"}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                  ) : (
                    <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                      <AvatarImage src="" />
                      <UserAvatarFallback iconClassName="h-24 w-24" />
                    </Avatar>
                  )}
              </div>

              {/* Match Percentage */}
              <div className="flex-none">
                {match.compatibility_score !== null &&
                  match.compatibility_score !== undefined && (
                    <div className="flex items-baseline gap-1.5 mb-4">
                      <h2 className="text-lg font-bold text-foreground tracking-tighter leading-none">
                        {Math.round(
                          match.compatibility_score <= 1
                            ? match.compatibility_score * 100
                            : match.compatibility_score
                        )}%
                      </h2>
                      <p className="text-sm font-semibold text-foreground tracking-tight leading-none">
                        similar
                      </p>
                    </div>
                  )}
                <div className="flex flex-wrap gap-2.5">
                  {user.interests?.slice(0, 4).map((interest: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-4 py-1 rounded-full text-xs font-semibold bg-secondary border border-border text-foreground"
                    >
                      {interest.charAt(0).toUpperCase() + interest.slice(1)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pt-4">
              {/* Travel Intentions */}
              {travelIntentions && travelIntentions.length > 0 && (
                <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Wants to visit
                  </p>
                  <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                    {travelIntentions.map((intent: any, idx: number) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                        <span>{intent.destination}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Trip Details Section */}
              {hasTripDetails && (
                <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Trip Details
                  </p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {match.destination?.split(",")[0]?.trim() ?? match.destination}
                    <span className="mx-2 text-muted-foreground">•</span>
                    ₹{Number(match.budget).toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {formatDateRange()}
                  </p>
                </div>
              )}

              {/* About Section */}
              <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  About Me
                </p>
                {gender && !isPreferNotToSay(gender) && (
                  <p className="text-sm font-semibold text-foreground">
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </p>
                )}

                {(() => {
                  const items = [
                    profession && !isPreferNotToSay(profession) && (profession.charAt(0).toUpperCase() + profession.slice(1)),
                    religion && !isPreferNotToSay(religion) && (religion.charAt(0).toUpperCase() + religion.slice(1)),
                    personality && !isPreferNotToSay(personality) && (personality.charAt(0).toUpperCase() + personality.slice(1))
                  ].filter(Boolean) as string[];
                  
                  if (items.length === 0) return null;
                  
                  return (
                    <p className="text-sm font-semibold text-foreground flex flex-wrap items-center">
                      {items.map((item, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                          <span>{item}</span>
                        </React.Fragment>
                      ))}
                    </p>
                  );
                })()}
                {languagesList.length > 0 && (
                  <p className="text-sm font-semibold text-foreground">
                    {languagesList.join(", ")}
                  </p>
                )}
              </div>

              {/* Interests Section */}
              {user.interests && user.interests.length > 0 && (
                <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    My Interests
                  </p>
                  <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                    {user.interests.map((interest: string, idx: number) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                        <span>
                          {interest.charAt(0).toUpperCase() + interest.slice(1)}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Lifestyle Section */}
              {(
                (user.foodPreference && !isPreferNotToSay(user.foodPreference)) ||
                (user.smoking && !isPreferNotToSay(user.smoking)) ||
                (user.drinking && !isPreferNotToSay(user.drinking))
              ) && (
                <div className="space-y-1.5 bg-secondary rounded-2xl p-3 flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Lifestyle
                  </p>
                  <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                    {(() => {
                    const foodText = user.foodPreference && !isPreferNotToSay(user.foodPreference)
                      ? String(user.foodPreference)
                          .replace(/_/g, " ")
                          .charAt(0)
                          .toUpperCase() +
                        String(user.foodPreference)
                          .replace(/_/g, " ")
                          .slice(1)
                      : null;

                    const smokingVal = user.smoking && !isPreferNotToSay(user.smoking)
                      ? (user.smoking === "no"
                          ? "No"
                          : user.smoking === "yes"
                          ? "Yes"
                          : String(user.smoking).replace(/_/g, " "))
                      : null;
                    const smokingText = smokingVal ? `Smoking: ${smokingVal.charAt(0).toUpperCase() + smokingVal.slice(1)}` : null;

                    const drinkingVal = user.drinking && !isPreferNotToSay(user.drinking)
                      ? (user.drinking === "no"
                          ? "No"
                          : user.drinking === "yes"
                          ? "Yes"
                          : String(user.drinking).replace(/_/g, " "))
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
              )}
            </div>
          )}
        </div>

        {/* Mobile Action Buttons */}
        <div className="flex pt-5 gap-3 shrink-0">
          <Button
            variant="default"
            className="flex-1 h-12 rounded-2xl text-sm font-bold bg-primary text-primary-foreground shadow-sm flex flex-row items-center justify-center gap-1 border-0"
            onClick={handleInterested}
            disabled={isInteresting || interestSent}
          >
            {isInteresting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : interestSent ? (
              "Sent"
            ) : (
              <>
                <span>Connect</span>
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
      {/* DESKTOP VIEW (Original untouched layout) */}
      {/* ============================================================== */}
      <div key={match.id} className="hidden md:flex flex-col flex-grow h-full justify-between gap-5">
        <div className="flex flex-col gap-4 flex-grow">
          {/* Name, Age, Location at the very top of Desktop View */}
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-foreground">
              {user.full_name || user.name || "Traveler"}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {user.age && `${user.age}, `}
              {typeof locationDisplay === "string"
                ? locationDisplay.split(",")[0].trim()
                : "Unknown"}
            </p>
          </div>

          {/* Header Section */}
          <div className="flex flex-col md:flex-row items-stretch gap-5 flex-grow">
            {/* Left Column: Avatar, Compatibility, Highlight Tags */}
            <div className="flex flex-col gap-5 w-full md:w-60 shrink-0">
              <div className="w-full aspect-[4/3] md:w-60 md:h-80 md:aspect-auto rounded-2xl overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0 relative shadow-none border border-border">
                {user.avatar ? (
                  <img
                    src={getFeedImageUrl(user.avatar)}
                    alt={user.full_name || user.name || "Traveler"}
                    className="w-full h-full object-cover cursor-pointer"
                  />
                ) : (
                  <Avatar className="w-full h-full text-lg rounded-2xl text-primary-foreground bg-secondary">
                    <AvatarImage
                      src=""
                      alt={user.full_name || user.name || "Traveler"}
                    />
                    <UserAvatarFallback iconClassName="h-24 w-24" />
                  </Avatar>
                )}
              </div>

              {/* Bio Card */}
              {/* {user.bio && (
                <div className="bg-secondary rounded-2xl p-4 flex flex-col gap-y-1.5 w-full text-left">
                  <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-line">
                    {user.bio}
                  </p>
                </div>
              )} */}

              {/* Match Percentage & Tags */}
              <div className="flex flex-col flex-1 w-full">
                {match.compatibility_score !== null &&
                  match.compatibility_score !== undefined && (
                    <div className="flex items-baseline gap-1.5 mb-5 flex-shrink-0">
                      <h2 className="text-xl font-bold text-foreground tracking-tighter leading-none">
                        {Math.round(
                          match.compatibility_score <= 1
                            ? match.compatibility_score * 100
                            : match.compatibility_score
                        )}%
                      </h2>
                      <p className="text-md font-semibold text-foreground tracking-tight leading-none">
                        similar
                      </p>
                    </div>
                  )}
                <div className="bg-secondary rounded-2xl p-6 flex flex-wrap content-start items-start gap-y-1.5 w-full flex-1">
                  {user.interests?.slice(0, 4).map((interest: string, idx: number) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="mx-1.5 text-muted-foreground">•</span>}
                      <span className="text-sm font-semibold text-foreground">
                        {interest.charAt(0).toUpperCase() + interest.slice(1)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Travel Details, About, Interests, Lifestyle in flex */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
              {(() => {
                const cards = [];

                // 1. Trip Details Container
                if (hasTripDetails) {
                  cards.push(
                    <div key="trip" className="space-y-1.5 bg-secondary rounded-2xl p-6 flex flex-col w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Trip Details</h3>
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {match.destination?.split(",")[0]?.trim() ?? match.destination}
                        <span className="mx-2 text-muted-foreground">•</span>
                        ₹{Number(match.budget).toLocaleString("en-IN")}
                      </p>
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {formatDateRange()}
                      </p>
                    </div>
                  );
                }

                // 1.5. Travel Intentions Container
                if (travelIntentions && travelIntentions.length > 0) {
                  cards.push(
                    <div key="intentions" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Wants to visit</h3>
                      <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                        {travelIntentions.map((intent: any, idx: number) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                            <span>{intent.destination}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 2. About Section
                const hasAbout = (gender && !isPreferNotToSay(gender)) ||
                  (profession && !isPreferNotToSay(profession)) ||
                  (religion && !isPreferNotToSay(religion)) ||
                  (personality && !isPreferNotToSay(personality)) ||
                  languagesList.length > 0;
                if (hasAbout) {
                  const items = [
                    gender && !isPreferNotToSay(gender) && (gender.charAt(0).toUpperCase() + gender.slice(1)),
                    profession && !isPreferNotToSay(profession) && (profession.charAt(0).toUpperCase() + profession.slice(1)),
                    religion && !isPreferNotToSay(religion) && (religion.charAt(0).toUpperCase() + religion.slice(1)),
                    personality && !isPreferNotToSay(personality) && (personality.charAt(0).toUpperCase() + personality.slice(1))
                  ].filter(Boolean) as string[];

                  cards.push(
                    <div key="about" className="space-y-1.5 bg-secondary rounded-2xl p-6 flex flex-col w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">About Me</h3>
                      {items.length > 0 && (
                        <div className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-y-1">
                          {items.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="mx-2 text-muted-foreground">•</span>}
                              <span>{item}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      {languagesList.length > 0 && (
                        <div className="text-sm font-semibold text-foreground mt-1 text-left">
                          {languagesList.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. Interests Section
                if (user.interests && user.interests.length > 0) {
                  cards.push(
                    <div key="interests" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Interests</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {user.interests.map((interest: string, idx: number) => (
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

                // 4. Lifestyle Section
                const hasLifestyle = (user.foodPreference && !isPreferNotToSay(user.foodPreference)) ||
                  (user.smoking && !isPreferNotToSay(user.smoking)) ||
                  (user.drinking && !isPreferNotToSay(user.drinking));
                if (hasLifestyle) {
                  cards.push(
                    <div key="lifestyle" className="bg-secondary rounded-2xl p-6 flex flex-col gap-y-2 w-full">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lifestyle</h3>
                      <div className="flex flex-wrap items-center gap-y-1">
                        {(() => {
                          const foodText = user.foodPreference && !isPreferNotToSay(user.foodPreference)
                            ? String(user.foodPreference)
                                .replace(/_/g, " ")
                                .charAt(0)
                                .toUpperCase() +
                              String(user.foodPreference)
                                .replace(/_/g, " ")
                                .slice(1)
                            : null;

                          const smokingVal = user.smoking && !isPreferNotToSay(user.smoking)
                            ? (user.smoking === "no"
                                ? "No"
                                : user.smoking === "yes"
                                ? "Yes"
                                : String(user.smoking).replace(/_/g, " "))
                            : null;
                          const smokingText = smokingVal ? `Smoking: ${smokingVal.charAt(0).toUpperCase() + smokingVal.slice(1)}` : null;

                          const drinkingVal = user.drinking && !isPreferNotToSay(user.drinking)
                            ? (user.drinking === "no"
                                ? "No"
                                : user.drinking === "yes"
                                ? "Yes"
                                : String(user.drinking).replace(/_/g, " "))
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
                <span className="hidden md:inline text-md font-semibold">
                  Skip
                </span>
              </>
            )}
          </Button>

          {/* 2. Interested Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleInterested}
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
                  Connect
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
              Report User
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Help us keep Kovari safe. Please select a reason for reporting
              this user.
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
                  <SelectItem value="fake_profile">Fake profile</SelectItem>
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

