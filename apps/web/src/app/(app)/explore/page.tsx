"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  KeyboardEvent,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/shared/components/ui/button";
import { ExploreSidebar } from "@/features/explore/components/ExploreSidebar";
import { ResultsDisplay } from "@/features/explore/components/ResultsDisplay";
import { SearchData, Filters } from "@/features/explore/types";
import { 
  fetchSoloTravelers, 
  fetchPublicGroups,
} from "@/features/explore/lib/fetchExploreData";
import {
  createSoloInterest,
  createGroupInterest,
  createSkipRecord
} from "@/features/explore/lib/matchingActions";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Filter } from "lucide-react";

const EXPLORE_TABS = [
  { label: "Solo Travel", value: "solo" },
  { label: "Group Travel", value: "groups" },
] as const;

// Persistent module-level cache for intent-based feed (survives page unmounts)
let globalSoloIntentCache: any[] | null = null;
let globalGroupIntentCache: any[] | null = null;

const isIntentBased = (search: SearchData, currentFilters?: Filters) => {
  const hasNoDestination = !search.destination || search.destination.trim() === "";
  if (!currentFilters) return hasNoDestination;

  // Check if filters match the default filters
  const hasNoFilters =
    currentFilters.ageRange[0] === 18 &&
    currentFilters.ageRange[1] === 65 &&
    currentFilters.gender === "Any" &&
    currentFilters.personality === "Any" &&
    currentFilters.smoking === "No" &&
    currentFilters.drinking === "No" &&
    currentFilters.nationality === "Any" &&
    currentFilters.travelStyle === "Any" &&
    (!currentFilters.interests || currentFilters.interests.length === 0) &&
    (!currentFilters.languages || currentFilters.languages.length === 0) &&
    currentFilters.budgetRange[0] === 5000 &&
    currentFilters.budgetRange[1] === 50000;

  return hasNoDestination && hasNoFilters;
};

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();

  // Get pre-filled destination from URL
  const getPrefilledDestination = () => {
    return searchParams.get("destination") || "";
  };

  // Get tab index from URL
  const getTabIndex = useCallback(() => {
    const tab = searchParams.get("tab");
    if (tab === "groups") return 1;
    return 0; // Default to solo
  }, [searchParams]);

  // State management - initialize from URL
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    if (tab === "groups") return 1;
    return 0;
  });

  // Sync activeTab with URL params
  useEffect(() => {
    const tabIndex = getTabIndex();
    if (activeTab !== tabIndex) {
      setActiveTab(tabIndex);
    }
  }, [searchParams, getTabIndex, activeTab]);
  const [matchedGroups, setMatchedGroups] = useState<any[]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchData, setLastSearchData] = useState<SearchData | null>(null);
  const [lastFilters, setLastFilters] = useState<Filters | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [datePickerPortalContainer, setDatePickerPortalContainer] =
    useState<HTMLDivElement | null>(null);

  // Per-tab result cache for instant switching
  const soloCache = useRef<{ results: any[]; index: number } | null>(null);
  const groupCache = useRef<{ results: any[]; index: number } | null>(null);
  const activeTabRef = useRef(activeTab);

  // Sync activeTabRef with activeTab
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Clamp currentGroupIndex when matchedGroups length changes to prevent out of bounds
  useEffect(() => {
    if (matchedGroups.length === 0) {
      setCurrentGroupIndex(0);
    } else if (currentGroupIndex >= matchedGroups.length) {
      setCurrentGroupIndex(Math.max(0, matchedGroups.length - 1));
    }
  }, [matchedGroups.length, currentGroupIndex]);

  // Search form state
  const [searchData, setSearchData] = useState<SearchData>({
    destination: getPrefilledDestination(),
    budget: 20000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
    travelMode: "solo",
  });

  // Filters state
  const [filters, setFilters] = useState<Filters>({
    ageRange: [18, 65],
    gender: "Any",
    interests: [],
    travelStyle: "Any",
    budgetRange: [5000, 50000],
    personality: "Any",
    smoking: "No",
    drinking: "No",
    nationality: "Any",
    languages: [],
  });

  // Update destination when URL changes
  useEffect(() => {
    const newDestination = getPrefilledDestination();
    if (newDestination && newDestination !== searchData.destination) {
      setSearchData((prev) => ({ ...prev, destination: newDestination }));
    }
  }, [searchParams, searchData.destination]);

  // Sync travelMode with activeTab when it changes
  useEffect(() => {
    setSearchData((prev) => ({
      ...prev,
      travelMode: activeTab === 0 ? "solo" : "group",
    }));
  }, [activeTab]);

  // Auto-search on mount with empty destination to show all travelers
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!user?.id) return;
    
    const initialSearch: SearchData = {
      destination: getPrefilledDestination(), // use URL param if present
      budget: 20000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      travelMode: activeTab === 0 ? "solo" : "group",
    };

    // Restore persistent intent-based cache directly if available
    const isIntent = isIntentBased(initialSearch, filters);
    if (isIntent) {
      const globalCache = activeTab === 0 ? globalSoloIntentCache : globalGroupIntentCache;
      if (globalCache && globalCache.length > 0) {
        setMatchedGroups(globalCache);
        setCurrentGroupIndex(0);
        if (activeTab === 0) {
          soloCache.current = { results: globalCache, index: 0 };
        } else {
          groupCache.current = { results: globalCache, index: 0 };
        }
      }
    }
    
    performSearch(initialSearch);
    // Mark as initialized after a tick to let the mount effect complete
    requestAnimationFrame(() => { hasInitialized.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only runs once when user is available

  // Auto-fetch on tab change: restore cache instantly, then refresh
  useEffect(() => {
    if (!user?.id) return;
    // Skip the initial mount — handled by the effect above
    if (!hasInitialized.current) return;

    // Restore cached results instantly for perceived speed
    const isIntent = isIntentBased(searchData, filters);
    const globalCache = activeTab === 0 ? globalSoloIntentCache : globalGroupIntentCache;
    const cache = activeTab === 0 ? soloCache.current : groupCache.current;

    if (isIntent && globalCache && globalCache.length > 0) {
      setMatchedGroups(globalCache);
      setCurrentGroupIndex(0);
    } else if (cache) {
      setMatchedGroups(cache.results);
      setCurrentGroupIndex(cache.index);
    } else {
      setMatchedGroups([]);
      setCurrentGroupIndex(0);
    }
    setSearchError(null);
    setLastSearchData(null);
    setLastFilters(null);

    // Trigger fresh fetch for this tab
    const refreshSearch: SearchData = {
      ...searchData,
      travelMode: activeTab === 0 ? "solo" : "group",
    };
    performSearch(refreshSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-trigger search when filters change with a debounce of 300ms
  useEffect(() => {
    if (!user?.id) return;
    if (!hasInitialized.current) return;

    const delayDebounce = setTimeout(() => {
      const fullSearchData: SearchData = {
        ...searchData,
        travelMode: activeTab === 0 ? "solo" : "group",
      };
      performSearch(fullSearchData);
    }, 300);

    return () => clearTimeout(delayDebounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Handle tab change with URL sync
  const handleTabChange = useCallback(
    (index: number) => {
      if (index !== activeTab) {
        setActiveTab(index);
        const tabValue = EXPLORE_TABS[index].value;
        router.push(`/explore?tab=${tabValue}`, { scroll: false });
      }
    },
    [activeTab, router],
  );

  // Keyboard navigation for tabs
  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTabChange((activeTab + 1) % EXPLORE_TABS.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTabChange(
          (activeTab - 1 + EXPLORE_TABS.length) % EXPLORE_TABS.length,
        );
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleTabChange(index);
      } else if (event.key === "Home") {
        event.preventDefault();
        handleTabChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        handleTabChange(EXPLORE_TABS.length - 1);
      }
    },
    [activeTab, handleTabChange],
  );

  // Tab buttons with groups layout styling
  const tabButtons = useMemo(
    () =>
      EXPLORE_TABS.map((tab, idx) => (
        <Button
          key={tab.value}
          variant={"outline"}
          className={`flex-auto text-xs sm:text-sm ${
            activeTab === idx
              ? "text-primary bg-card hover:bg-card font-semibold rounded-2xl shadow-sm hover:text-primary border-1 border-primary dark:border-primary"
              : "text-foreground font-semibold bg-card rounded-2xl hover:text-primary hover:bg-card"
          }`}
          onClick={() => handleTabChange(idx)}
          onKeyDown={(e) => handleTabKeyDown(e, idx)}
        >
          {tab.label}
        </Button>
      )),
    [activeTab, handleTabChange, handleTabKeyDown],
  );

  const filtersEqual = (a: Filters, b: Filters): boolean => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const arrEq = (x: string[], y: string[]) =>
      x.length === y.length &&
      [...x].sort().join(",") === [...y].sort().join(",");
    return (
      a.ageRange[0] === b.ageRange[0] &&
      a.ageRange[1] === b.ageRange[1] &&
      a.gender === b.gender &&
      a.personality === b.personality &&
      a.smoking === b.smoking &&
      a.drinking === b.drinking &&
      a.nationality === b.nationality &&
      a.travelStyle === b.travelStyle &&
      arrEq(a.interests || [], b.interests || []) &&
      arrEq(a.languages || [], b.languages || []) &&
      a.budgetRange[0] === b.budgetRange[0] &&
      a.budgetRange[1] === b.budgetRange[1]
    );
  };

  const hasSearchParamsChanged = (
    newSearchData: SearchData,
    newFilters: Filters,
  ): boolean => {
    if (!lastSearchData) return true;
    const searchDataChanged =
      newSearchData.destination !== lastSearchData.destination ||
      newSearchData.budget !== lastSearchData.budget ||
      newSearchData.startDate.getTime() !==
        lastSearchData.startDate.getTime() ||
      newSearchData.endDate.getTime() !== lastSearchData.endDate.getTime();
    const filtersChanged =
      !lastFilters || !filtersEqual(newFilters, lastFilters);
    return searchDataChanged || filtersChanged;
  };

  const handleSearch = () => {
    setIsSheetOpen(false);
    const fullSearchData: SearchData = {
      ...searchData,
      travelMode: activeTab === 0 ? "solo" : "group",
    };

    if (!hasSearchParamsChanged(fullSearchData, filters)) {
      return;
    }

    performSearch(fullSearchData);
  };

  const performSearch = async (fullSearchData: SearchData, overrideFilters?: Filters) => {
    const activeFilters = overrideFilters || filters;

    const isStillCurrent = () => {
      const currentMode = activeTabRef.current === 0 ? "solo" : "group";
      return fullSearchData.travelMode === currentMode;
    };

    const isIntent = isIntentBased(fullSearchData, activeFilters);
    const globalCache = fullSearchData.travelMode === "solo" ? globalSoloIntentCache : globalGroupIntentCache;
    const currentCache = fullSearchData.travelMode === "solo" ? soloCache.current : groupCache.current;
    
    // Check if parameters/filters have changed compared to last successful search
    const paramsChanged = hasSearchParamsChanged(fullSearchData, activeFilters);

    // Cache is valid if parameters/filters haven't changed, OR if we are transitioning to the intent-based feed and have the global cache
    const hasCache = (!paramsChanged && (currentCache && currentCache.results.length > 0)) ||
                     (isIntent && globalCache && globalCache.length > 0);

    console.log("Starting search with data:", fullSearchData);
    if (isStillCurrent()) {
      // Only show the loading spinner if we don't have cached results to show directly
      if (!hasCache) {
        setSearchLoading(true);
      }
      setSearchError(null);
      
      const resultsToKeep = isIntent 
        ? (globalCache || []) 
        : (currentCache?.results || []);

      // If params changed and it's NOT an intent-based cache restore, clear matches
      if ((paramsChanged && !isIntent) || resultsToKeep.length === 0) {
        setMatchedGroups([]);
        setCurrentGroupIndex(0);
      } else if (isIntent && globalCache && globalCache.length > 0) {
        setMatchedGroups(globalCache);
        setCurrentGroupIndex(0);
      }
    }

    try {
      const userId = user?.id;

      if (fullSearchData.travelMode === "solo") {
        // SOLO TRAVEL MODE - Only search for solo travelers
        if (!userId) {
          throw new Error("Please sign in to search for solo travelers");
        }

        // Step 1: Store enhanced dynamic session (for solo matching)
        const sessionPayload: any = {
          userId,
          destinationName: fullSearchData.destination,
          budget: fullSearchData.budget,
          startDate: fullSearchData.startDate.toISOString().split("T")[0],
          endDate: fullSearchData.endDate.toISOString().split("T")[0],
          travelMode: fullSearchData.travelMode,
        };

        if (fullSearchData.destinationDetails) {
          sessionPayload.destination = {
            name:
              fullSearchData.destinationDetails.formatted ||
              fullSearchData.destination,
            lat: fullSearchData.destinationDetails.lat,
            lon: fullSearchData.destinationDetails.lon,
            city: fullSearchData.destinationDetails.city,
            country: fullSearchData.destinationDetails.country,
          };
        }

        // Step 1: Store session first and wait for it to complete to prevent race conditions in Redis
        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionPayload),
        }).catch((err) => console.warn("Session store failed:", err));

        // Step 2: Fetch solo matches
        const { data: travelers, meta: soloMeta } = await fetchSoloTravelers(
          userId,
          {
            destination: fullSearchData.destination,
            ageMin: activeFilters.ageRange[0],
            ageMax: activeFilters.ageRange[1],
            gender: activeFilters.gender,
            interests: activeFilters.interests,
            languages: activeFilters.languages,
            personality: activeFilters.personality,
            smoking: activeFilters.smoking,
            drinking: activeFilters.drinking,
            nationality: activeFilters.nationality,
            dateStart: fullSearchData.startDate,
            dateEnd: fullSearchData.endDate,
            budgetRange: `${activeFilters.budgetRange[0]}-${activeFilters.budgetRange[1]}`
          } as any
        );

        if (travelers.length > 0 || !soloMeta?.degraded) {
          // Convert lib structure to what ResultsDisplay expects
          const soloMatchesAsGroups = travelers.map((traveler) => ({
            ...traveler, // Preserve everything including flat profile properties
            destination: (traveler as any).destination || fullSearchData.destination, // Keep traveler's destination if available, otherwise search filter
            budget: (traveler as any).budget || (traveler as any).Budget || fullSearchData.budget,
            start_date: (traveler as any).start_date ? new Date((traveler as any).start_date) : ((traveler as any).startDate ? new Date((traveler as any).startDate) : fullSearchData.startDate),
            end_date: (traveler as any).end_date ? new Date((traveler as any).end_date) : ((traveler as any).endDate ? new Date((traveler as any).endDate) : fullSearchData.endDate),
            compatibility_score: (traveler as any).compatibility_score ?? (traveler as any).compatibilityScore ?? null,
            user: {
              ...((traveler as any).user || {}), // Preserve the deeply hydrated user object
              id: traveler.id,
              userId: traveler.userId,
              name: traveler.name,
              age: traveler.age,
              bio: traveler.bio || (traveler as any).user?.bio || "",
            },
            is_solo_match: true,
          }));

          // Cache solo results
          soloCache.current = { results: soloMatchesAsGroups, index: 0 };

          // If this is an intent-based search, cache in global persistent cache too
          if (isIntent) {
            globalSoloIntentCache = soloMatchesAsGroups;
          }

          if (isStillCurrent()) {
            setMatchedGroups(soloMatchesAsGroups);
            setCurrentGroupIndex(0);
            setLastSearchData(fullSearchData);
            setLastFilters(activeFilters);
          }
        }
      } else {
        // GROUP TRAVEL MODE - Use centralized helper
        const { data: groups, meta: groupMeta } = await fetchPublicGroups(
          userId || "",
          {
            destination: fullSearchData.destination,
            dateStart: fullSearchData.startDate,
            dateEnd: fullSearchData.endDate,
            ageMin: activeFilters.ageRange[0],
            ageMax: activeFilters.ageRange[1],
            gender: activeFilters.gender,
            interests: activeFilters.interests,
            languages: activeFilters.languages,
            smoking: activeFilters.smoking,
            drinking: activeFilters.drinking,
            nationality: activeFilters.nationality,
            budgetRange: `${activeFilters.budgetRange[0]}-${activeFilters.budgetRange[1]}`
          } as any
        );

        const transformedGroups = groups.map((group) => ({
          ...group, // Preserve everything including flat profile properties
          id: group.id,
          name: group.name,
          privacy: group.privacy,
          destination: fullSearchData.destination, // Explicitly override with the searched trip destination
          startDate: group.dateRange?.start || (group as any).startDate,
          endDate: group.dateRange?.end || (group as any).endDate,
          budget: group.budget !== undefined && group.budget !== null ? group.budget : fullSearchData.budget,
          memberCount: group.memberCount,
          userStatus: group.userStatus || "Open",
          creator: group.creator,
          cover_image: group.cover_image,
          score: (group as any).score || 0,
        }));

        // Cache group results
        groupCache.current = { results: transformedGroups, index: 0 };

        // If this is an intent-based search, cache in global persistent cache too
        if (isIntent) {
          globalGroupIntentCache = transformedGroups;
        }

        if (isStillCurrent()) {
          setMatchedGroups(transformedGroups);
          setCurrentGroupIndex(0);
          setLastSearchData(fullSearchData);
          setLastFilters(activeFilters);
        }
      }
    } catch (err: any) {
      if (isStillCurrent()) {
        setSearchError(err.message || "Unknown error");
      }
      console.error("Search error:", err);
    } finally {
      if (isStillCurrent()) {
        setSearchLoading(false);
      }
    }
  };

  // Tab change state reset is now handled in the auto-fetch useEffect above

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Navigation functions
  const handlePreviousGroup = () => {
    if (currentGroupIndex > 0) {
      setCurrentGroupIndex(currentGroupIndex - 1);
    }
  };

  const handleNextGroup = () => {
    if (currentGroupIndex < matchedGroups.length - 1) {
      setCurrentGroupIndex(currentGroupIndex + 1);
    } else if (matchedGroups.length > 0) {
      // No more matches - clear the results to show "no more matches" message
      setMatchedGroups([]);
      setCurrentGroupIndex(0);
    }
  };

  // Helper to remove swiped/interacted matches from UI and cache immediately
  const handleRemoveMatchedGroup = useCallback((id: string) => {
    setMatchedGroups((prev) => {
      const filtered = prev.filter((m) => m.id !== id && m.userId !== id && m.user?.userId !== id);
      
      // Update cache refs
      if (activeTabRef.current === 0) {
        if (soloCache.current) {
          soloCache.current.results = filtered;
        }
        globalSoloIntentCache = filtered;
      } else {
        if (groupCache.current) {
          groupCache.current.results = filtered;
        }
        globalGroupIntentCache = filtered;
      }
      
      return filtered;
    });
  }, []);

  // Action handlers
  const handleConnect = async (matchId: string) => {
    // API call is handled directly in SoloMatchCard
    handleRemoveMatchedGroup(matchId);
  };

  const handleSuperLike = async (matchId: string) => {
    console.warn("Super like not yet implemented");
    handleRemoveMatchedGroup(matchId);
  };

  const handlePass = async (matchId: string) => {
    // API call is handled directly in SoloMatchCard
    handleRemoveMatchedGroup(matchId);
  };

  const handleComment = async (
    matchId: string,
    attribute: string,
    comment: string,
  ) => {
    // TODO: Implement comment submission logic
  };

  const handleViewProfile = (userId: string) => {
    if (!userId) return;
    router.push(`/profile/${userId}`);
  };

  const handleJoinGroup = async (groupId: string) => {
    // API call is handled directly in GroupMatchCard
    handleRemoveMatchedGroup(groupId);
  };

  const handleRequestJoin = async (groupId: string) => {
    handleJoinGroup(groupId);
  };

  const handlePassGroup = async (groupId: string) => {
    // API call is handled directly in GroupMatchCard
    handleRemoveMatchedGroup(groupId);
  };

  const handleViewGroup = (groupId: string) => {
    if (!groupId) return;
    router.push(`/groups/${groupId}/home`);
  };

  return (
    <div className="h-[calc(100dvh-5.5rem)] md:min-h-screen overflow-hidden px-4 pb-0 md:pb-4 flex flex-col">
      <div className="max-w-full mx-auto flex flex-col gap-0 flex-1 min-h-0 w-full">
        {/* Tabs Header - Outside containers like groups layout */}
        <header className="flex w-full items-center gap-2 sticky top-0 z-50 bg-background py-4">
          <div className="flex gap-2 flex-auto min-[930px]:w-auto min-[930px]:flex-none">
            {tabButtons}
          </div>

          {/* Mobile Filter Trigger */}
          <div className="flex-auto min-[930px]:hidden">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full text-xs sm:text-sm text-foreground font-semibold bg-card rounded-2xl hover:text-primary"
                >
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="h-[90dvh] bg-card p-0 rounded-t-3xl w-full"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <SheetTitle className="sr-only">Filters</SheetTitle>
                <div
                  ref={(el) => setDatePickerPortalContainer(el ?? null)}
                  className="h-full pt-2 relative"
                >
                  <ExploreSidebar
                    activeTab={activeTab}
                    searchData={searchData}
                    filters={filters}
                    searchLoading={searchLoading}
                    onSearchDataChange={setSearchData}
                    onSearch={handleSearch}
                    onFilterChange={handleFilterChange}
                    datePickerPortalContainer={datePickerPortalContainer}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 flex flex-col min-[930px]:flex-row gap-3 min-[930px]:h-[calc(100vh-9rem)] lg:h-[calc(100vh-10rem)]">
          {/* Left Sidebar - Rounded Container */}
          <div className="hidden min-[930px]:flex w-full min-[930px]:w-1/3 flex-shrink-0 rounded-3xl bg-card border-1 border-border overflow-hidden flex-col">
            <ExploreSidebar
              activeTab={activeTab}
              searchData={searchData}
              filters={filters}
              searchLoading={searchLoading}
              onSearchDataChange={setSearchData}
              onSearch={handleSearch}
              onFilterChange={handleFilterChange}
            />
          </div>

          {/* Right Content Area - Rounded Container */}
          <div className="w-full min-[930px]:w-2/3 bg-card rounded-3xl border-1 border-border overflow-hidden flex flex-col flex-1 h-full min-h-0">
            <ResultsDisplay
              activeTab={activeTab}
              matchedGroups={matchedGroups}
              currentGroupIndex={currentGroupIndex}
              searchLoading={searchLoading}
              searchError={searchError}
              lastSearchData={lastSearchData}
              currentUserId={user?.id}
              destinationId={searchData.destination}
              onPreviousGroup={handlePreviousGroup}
              onNextGroup={handleNextGroup}
              onConnect={handleConnect}
              onSuperLike={handleSuperLike}
              onPass={handlePass}
              onComment={handleComment}
              onViewProfile={handleViewProfile}
              onJoinGroup={handleJoinGroup}
              onRequestJoin={handleRequestJoin}
              onPassGroup={handlePassGroup}
              onViewGroup={handleViewGroup}
              onSearchWithoutDestination={() => {
                setSearchData(prev => ({ ...prev, destination: "" }));
                const defaultFilters: Filters = {
                  ageRange: [18, 65],
                  gender: "Any",
                  interests: [],
                  travelStyle: "Any",
                  budgetRange: [5000, 50000],
                  personality: "Any",
                  smoking: "No",
                  drinking: "No",
                  nationality: "Any",
                  languages: [],
                };
                setFilters(defaultFilters);
                performSearch({
                  ...searchData,
                  destination: "",
                  travelMode: activeTab === 0 ? "solo" : "group",
                }, defaultFilters);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

