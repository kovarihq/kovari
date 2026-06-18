"use client";
import { Search, Bell, Heart, ChevronRight, CheckCheck } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { diagLog } from "@/lib/observability/performance";
import { useAuthStore } from "@/shared/stores/useAuthStore";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";

import { Skeleton } from "@heroui/react";
import InboxChatListSkeleton from "@/shared/components/layout/inbox-chat-list-skeleton";
import DashboardCard from "@/shared/components/ui/DashboardCard";
import DoneTripsCard from "@/shared/components/DoneTripsCard/DoneTripsCard";
import {
  GroupList,
  GroupListSkeleton,
} from "@/shared/components/GroupCard/GroupCard-list";
import TodoChecklist from "@/shared/components/Todo-Checklist/Todo-checklist";
import dynamic from "next/dynamic";

const UpcomingTripCard = dynamic(
  () =>
    import("@/features/dashboard/UpcomingTripCard").then((mod) => ({
      default: mod.UpcomingTripCard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full h-full min-h-0 rounded-xl overflow-hidden bg-card">
        <Skeleton className="absolute inset-0 size-full rounded-xl" />
      </div>
    ),
  },
);

import { useUserGroups } from "@/shared/hooks/useUserGroups";
import { useUserTrips } from "@/shared/hooks/useUserTrips";
import { usePendingInvites } from "@/shared/hooks/usePendingInvites";
import { useNotifications } from "@/shared/hooks/useNotifications";
import { Notification } from "@kovari/types";
import {
  getNotificationLink,
  getAvatarFallback,
  shouldShowPoolIcon,
} from "@kovari/utils";
import { formatNotificationTime } from "@kovari/utils";

import {
  getMostFrequentDestinations,
  getMostRecentGroupCoverForDestination,
  getTotalTravelDays,
  getUniqueCoTravelers,
  getTripsPerYear,
} from "@kovari/utils";

import { isBefore, isAfter } from "date-fns";
import { Card, CardContent } from "@/shared/components/ui/card";
import { GroupCard } from "@/features/dashboard/GroupCard";
import Component from "@/shared/components/comp-531";
import { GalleryCard } from "@/features/dashboard/GalleryCard";
import { TopDestinationCard } from "@/features/dashboard/TopDestinationCard";
import { TravelDaysCard } from "@/features/dashboard/TravelDaysCard";
import type { UserProfile as UserProfileType } from "@/features/profile/components/user-profile";
import { InviteCard } from "@/features/dashboard/InviteCard";
import { UserConnect } from "@/features/dashboard/UserConnect";
import { ConnectionRequestsCard } from "@/features/dashboard/ConnectionRequestsCard";

import ItineraryUI from "@/shared/components/comp-542";
import Link from "next/link";
import { OnboardingChecklist } from "@/features/onboarding-tour/components/OnboardingChecklist";

interface ItineraryEvent {
  id: string;
  time: { hour: number; minute: number; ampm: "AM" | "PM" };
  label?: string;
  description: string;
  duration: string;
  active: boolean;
}

interface ItineraryDay {
  id: number;
  name: string;
  events: ItineraryEvent[];
}

// Dashboard Skeleton Components - Simplified (outer cards only)
function DashboardSkeleton() {
  return (
    <div className="h-full bg-background p-4 flex flex-col gap-3">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between pb-2">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-6">
          <Skeleton className="h-5 w-20" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 h-full">
        {/* Left Column */}
        <div className="flex flex-col w-full lg:w-1/2 gap-3 h-full">
          {/* Top Row: Cards */}
          <div className="flex flex-col md:flex-row gap-3 lg:h-[160px]">
            {/* Upcoming Trip Card Skeleton */}
            <div className="w-full md:w-1/3 h-[180px] md:h-full">
              <Skeleton className="w-full h-full rounded-xl" />
            </div>
            {/* Top Destination Card Skeleton */}
            <div className="w-full md:w-1/3 h-[180px] md:h-full">
              <Skeleton className="w-full h-full rounded-xl" />
            </div>
            {/* Stats Cards Skeleton */}
            <div className="w-full md:w-1/3 flex flex-col gap-3 h-full">
              <Skeleton className="flex-1 w-full rounded-xl" />
              <Skeleton className="flex-1 w-full rounded-xl" />
            </div>
          </div>

          {/* Bottom Row: Groups and Requests */}
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            {/* Travel Groups Skeleton */}
            <div className="w-full md:flex-1 min-w-0">
              <Skeleton className="w-full h-full rounded-xl max-h-[85vh]" />
            </div>

            {/* Connection Requests Skeleton */}
            <div className="w-full md:flex-1 min-w-0">
              <Skeleton className="w-full h-full rounded-xl max-h-[85vh]" />
            </div>
          </div>
        </div>

        {/* Right Column: Itinerary Skeleton */}
        <div className="flex flex-col w-full lg:w-1/2 h-full">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

import { useOnboardingTour } from "@/features/onboarding-tour/hooks/useOnboardingTour";

export default function Dashboard() {
  const { user, isSignedIn } = useUser();
  const setUser = useAuthStore((s) => s.setUser);
  const tourState = useOnboardingTour();

  const { groups, loading: groupsLoading } = useUserGroups();
  const { trips } = useUserTrips();
  const { invites } = usePendingInvites();

  const [travelDays, setTravelDays] = useState<string[]>([]);
  const [itineraryDays, setItineraryDays] = useState<ItineraryDay[]>([]);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [profileImpressions, setProfileImpressions] = useState<number | null>(
    null,
  );
  const [impressionsLoading, setImpressionsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Fetch notifications for popover
  const {
    notifications,
    loading: notificationsLoading,
    unreadCount,
    markAllAsRead,
    markAsRead,
  } = useNotifications({ limit: 5, unreadOnly: false, realtime: true });

  useEffect(() => {
    diagLog("Dashboard mounted");
    if (isSignedIn && user) setUser(user);
  }, [isSignedIn, user]);

  useEffect(() => {
    fetch("/api/travel-days")
      .then((res) => res.json())
      .then((data) => setTravelDays(data.travelDays || []));
  }, []);

  // Fetch profile impressions
  const fetchProfileImpressions = useCallback(async () => {
    if (isSignedIn && user) {
      diagLog("fetchProfileImpressions triggered");
      const start = performance.now();
      setImpressionsLoading(true);
      try {
        const res = await fetch("/api/profile-impressions");
        const data = await res.json();
        diagLog(`fetchProfileImpressions completed in ${Math.round(performance.now() - start)}ms`);
        setProfileImpressions(data.impressions || 0);
      } catch (err) {
        diagLog(`fetchProfileImpressions failed in ${Math.round(performance.now() - start)}ms`);
        console.error("Error fetching profile impressions:", err);
        setProfileImpressions(0);
      } finally {
        setImpressionsLoading(false);
      }
    }
  }, [isSignedIn, user]);

  useEffect(() => {
    fetchProfileImpressions();
  }, [fetchProfileImpressions]);

  // Refresh impressions when page comes into focus (user navigates back from explore)
  useEffect(() => {
    const handleFocus = () => {
      fetchProfileImpressions();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchProfileImpressions();
      }
    };

    // Also refresh periodically every 30 seconds when page is visible
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchProfileImpressions();
      }
    }, 30000); // 30 seconds

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [fetchProfileImpressions]);

  const formattedTravelDays = travelDays.filter((d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
  const years = useMemo(
    () =>
      [...new Set(formattedTravelDays.map((d) => +d.split("-")[0]))].sort(
        (a, b) => b - a,
      ),
    [formattedTravelDays],
  );
  const [selectedYear, setSelectedYear] = useState(
    () => years[0] || new Date().getFullYear(),
  );

  useEffect(() => {
    if (years.length && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [years]);

  const now = new Date();

  const past = useMemo(
    () =>
      groups
        .filter(
          (g) =>
            g.group?.start_date && isBefore(new Date(g.group.start_date), now),
        )
        .sort(
          (a, b) =>
            new Date(b.group?.start_date!).getTime() -
            new Date(a.group?.start_date!).getTime(),
        ),
    [groups],
  );

  const upcoming = useMemo(
    () =>
      groups
        .filter(
          (g) =>
            g.group?.start_date && isAfter(new Date(g.group.start_date), now),
        )
        .sort(
          (a, b) =>
            new Date(a.group?.start_date!).getTime() -
            new Date(b.group?.start_date!).getTime(),
        ),
    [groups],
  );

  const nearestUpcomingGroupId = upcoming[0]?.group?.id;
  const selectedGroupId = nearestUpcomingGroupId || past[0]?.group?.id;

  // Fetch itinerary
  useEffect(() => {
    if (!selectedGroupId) {
      setItineraryDays([]);
      return;
    }

    setItineraryLoading(true);
    setItineraryError(null);

    fetch(`/api/Itinerary?groupId=${selectedGroupId}`)
      .then((res) => {
        return res.json();
      })
      .then((data) => {
        const byDay: { [date: string]: any[] } = {};
        data.forEach((item: any) => {
          const date = item.datetime?.split("T")[0];
          if (!date) return;
          byDay[date] = byDay[date] || [];
          byDay[date].push(item);
        });

        const sortedDays = Object.keys(byDay).sort();
        const mapped = sortedDays.map((date, idx) => ({
          id: idx + 1,
          name: `Day ${idx + 1}`,
          events: byDay[date].map((item: any) => {
            const t = new Date(item.datetime);
            let hour = t.getHours(),
              minute = t.getMinutes();
            const ampm: "AM" | "PM" = hour >= 12 ? "PM" : "AM";
            hour = hour % 12 || 12;
            return {
              id: item.id,
              time: { hour, minute, ampm },
              label: item.title,
              description: item.description,
              duration: item.duration || "",
              active: !item.is_archived,
            };
          }),
        }));
        setItineraryDays(mapped);
      })
      .catch((err) => {
        console.error("API /api/Itinerary error:", err);
        setItineraryError(err.message || "Unknown error");
      })
      .finally(() => setItineraryLoading(false));
  }, [selectedGroupId]);

  const mostVisited = getMostFrequentDestinations(groups);
  const totalDays = getTotalTravelDays(groups);
  const coTravelers = getUniqueCoTravelers(groups);
  const tripsPerYear = useMemo(() => getTripsPerYear(groups), [groups]);

  // Helper to extract name and country from destination
  const getNameAndCountry = (
    destination?: string,
  ): { name: string; country: string } => {
    if (!destination) return { name: "", country: "" };
    const parts = destination.split(",").map((part) => part.trim());
    return {
      name: parts[0] || "",
      country: parts[1] || "",
    };
  };

  // Top destination: most frequent destination + cover from most recent matching group
  const topDestinationNameCountry = getNameAndCountry(
    mostVisited === "N/A" ? undefined : mostVisited,
  );
  const topDestinationCoverImage =
    getMostRecentGroupCoverForDestination(groups, mostVisited) ?? undefined;

  // Upcoming trip: selected group (nearest upcoming or most recent past)
  const selectedGroup = upcoming[0] || past[0];
  const { name, country } = getNameAndCountry(
    selectedGroup?.group?.destination || undefined,
  );

  // Get trip dates from the selected group
  const startDate = selectedGroup?.group?.start_date || undefined;
  const endDate = selectedGroup?.group?.end_date || undefined;

  const handleExplore = () => {
    if (!name) return;
    const query = encodeURIComponent(name);
    const url = `https://maps.apple.com/search?query=${query}`;
    window.open(url, "_blank");
  };

  const handleExploreTopDestination = () => {
    const topName = topDestinationNameCountry.name;
    if (!topName) return;
    const query = encodeURIComponent(topName);
    const url = `https://maps.apple.com/search?query=${query}`;
    window.open(url, "_blank");
  };

  const showFullSkeleton = !isSignedIn || tourState.loading;

  return (
    <div className="h-full bg-background p-4 flex flex-col gap-3 overflow-y-auto scrollbar-hide">
      {showFullSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className={`flex items-center justify-between pb-2 flex-shrink-0 ${!tourState.completed ? "mt-2 gap-2 sm:px-6" : ""}`}>
            {!tourState.completed ? (
              <div className="mb-2">
                <h2 className="text-xl font-bold text-foreground tracking-tight mb-1">
                  {tourState.allDone ? "You're ready to explore! 🎉" : "Welcome to Kovari 👋🏻"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Complete these quick steps to get the most out of your travel experience.
                </p>
              </div>
            ) : (
              <div>
                <h1 className="text-sm font-semibold">
                Hi, {user?.firstName || "User"}
              </h1>
              <p className="text-muted-foreground font-medium text-sm">
                Welcome back to Kovari 👋🏻
              </p>
            </div>
            )}
            <div className="flex items-center gap-4">
              {/* <Search className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" /> */}
              {/* Mobile: Link to notifications page */}
              <Link href="/notifications" className="md:hidden">
                <div className="relative cursor-pointer">
                  <Bell className="w-5 h-5 text-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-0.5 w-3 h-3 bg-primary rounded-full border-[2px] border-background" />
                  )}
                </div>
              </Link>
              {/* Desktop: Popover */}
              <div className="hidden md:block">
                <Popover
                  open={notificationsOpen}
                  onOpenChange={setNotificationsOpen}
                >
                  <PopoverTrigger asChild>
                    <div className="relative cursor-pointer">
                      <Bell className="w-5 h-5 text-foreground" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-0.5 w-3 h-3 bg-primary rounded-full border-[2px] border-background" />
                      )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[380px] p-0 max-h-[600px] flex flex-col shadow-none rounded-xl"
                    align="end"
                    sideOffset={8}
                  >
                    {/* Header */}
                    <div className="p-4 py-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground">
                          Notifications
                        </h2>
                        <Button
                          variant={"ghost"}
                          onClick={async () => {
                            await markAllAsRead();
                          }}
                          disabled={unreadCount === 0}
                          className="text-sm !px-0 text-primary font-medium hover:bg-transparent hover:text-primary focus-visible:border-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Mark all as read
                        </Button>
                      </div>
                    </div>

                    {/* Notifications List */}
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                      {notificationsLoading ? (
                        <InboxChatListSkeleton />
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                          <Bell className="w-5 h-5 text-muted-foreground mb-2 opacity-50" />
                          <p className="text-xs text-muted-foreground">
                            No notifications
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {notifications.slice(0, 5).map((notification) => {
                            const notificationLink =
                              getNotificationLink(notification);
                            const avatarFallback =
                              getAvatarFallback(notification);
                            // @ts-ignore - Check for report type
                            const isReport =
                              notification.type === "REPORT_SUBMITTED";

                            return (
                              <Link
                                key={notification.id}
                                href={notificationLink}
                                onClick={async () => {
                                  if (!notification.is_read) {
                                    await markAsRead(notification.id);
                                  }
                                  setNotificationsOpen(false);
                                }}
                                className={`flex items-start gap-3 p-4 transition-colors cursor-pointer ${
                                  !notification.is_read
                                    ? "bg-secondary"
                                    : "hover:bg-secondary"
                                }`}
                              >
                                {isReport ? (
                                  <div className="w-10 h-10 flex-shrink-0 rounded-full bg-green-100 flex items-center justify-center">
                                    <CheckCheck className="w-5 h-5 text-green-600" />
                                  </div>
                                ) : (
                                  <Avatar className="w-10 h-10 flex-shrink-0">
                                    <AvatarImage
                                      src={notification.image_url || undefined}
                                      alt={notification.title}
                                      className="object-cover"
                                    />
                                    <AvatarFallback className="bg-secondary text-foreground text-xs font-semibold">
                                      {avatarFallback}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-foreground mb-1">
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {notification.message}
                                    {notification.created_at && (
                                      <>
                                        {" · "}
                                        <span className="text-muted-foreground/80">
                                          {formatNotificationTime(
                                            notification.created_at,
                                          )}
                                        </span>
                                      </>
                                    )}
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-border">
                      <Link
                        href="/notifications"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        <Button
                          variant="secondary"
                          className="w-full focus-visible:ring-0"
                        >
                          See all
                        </Button>
                      </Link>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <Link href={"/requests"}>
                <Heart className="w-5 h-5 text-foreground cursor-pointer" />
              </Link>
            </div>
          </div>
          {!tourState.completed ? (
            <OnboardingChecklist tourState={tourState} />
          ) : (
            <div className="flex flex-col lg:flex-row gap-3 h-full min-h-0">
            <div className="flex flex-col w-full lg:w-1/2 gap-3 h-full">
              <div className="flex flex-col md:flex-row gap-3 lg:h-[160px]">
                <div className="w-full md:w-1/3 h-[180px] md:h-full min-h-0">
                  <div className="h-full min-h-0">
                    <TopDestinationCard
                      name={topDestinationNameCountry.name}
                      country={topDestinationNameCountry.country}
                      imageUrl={topDestinationCoverImage}
                      onExplore={handleExploreTopDestination}
                      isLoading={groupsLoading}
                    />
                  </div>
                </div>
                <div className="w-full md:w-1/3 h-[180px] md:h-full min-h-0">
                  <div className="h-full min-h-0">
                    <UpcomingTripCard
                      groupId={selectedGroupId || ""}
                      name={name}
                      country={country}
                      startDate={startDate}
                      endDate={endDate}
                      onExplore={handleExplore}
                      isLoading={groupsLoading}
                    />
                  </div>
                </div>
                <div className="w-full md:w-1/3 flex flex-col gap-3 h-full">
                  <div className="flex-1">
                    <DashboardCard
                      title="Total Travel Days"
                      value={`${totalDays} days`}
                      loading={groupsLoading}
                      subtitle="Total travel days across all groups"
                    />
                  </div>
                  <div className="flex-1">
                    <DashboardCard
                      title="Profile Impressions"
                      value={
                        impressionsLoading
                          ? "Loading..."
                          : profileImpressions !== null
                            ? `${profileImpressions} impression${profileImpressions !== 1 ? "s" : ""}`
                            : "0 impressions"
                      }
                      loading={impressionsLoading || groupsLoading}
                      subtitle="Total profile impressions"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3 flex-1">
                <div className="w-full md:flex-1 min-w-0 bg-card border border-border rounded-xl h-full flex flex-col max-h-[85vh]">
                  <div className="mb-0 p-4 border-b border-border flex-shrink-0">
                    <h2 className="text-foreground font-medium text-xs truncate">
                      Travel Groups
                    </h2>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      Manage your collaborative travel experiences
                    </p>
                  </div>
                  <div className="px-0 flex-1 overflow-hidden">
                    {groupsLoading ? (
                      <div className="overflow-y-auto scrollbar-hide">
                        <GroupListSkeleton />
                      </div>
                    ) : (
                      <GroupList title="My Groups" />
                    )}
                  </div>
                </div>
                <div className="w-full md:flex-1 min-w-0 h-full flex flex-col">
                  <div className="flex-1 min-h-0">
                    <ConnectionRequestsCard />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col w-full lg:w-1/2 h-full min-h-0">
              <div className="h-full min-h-0 overflow-hidden flex flex-col">
                <ItineraryUI />
              </div>
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

