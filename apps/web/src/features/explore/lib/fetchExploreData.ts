// Traveler type for TravelerCard
export interface Traveler {
  id: string;
  userId: string;
  name: string;
  username: string;
  age: number;
  bio: string;
  profilePhoto: string;
  destination: string;
  travelDates: string;
  matchStrength: "high" | "medium" | "low";
  created_at: string;
  isFollowing: boolean;
}

// Group type for GroupCard
export interface Group {
  id: string;
  name: string;
  privacy: "public" | "private" | "invite-only";
  destination: string;
  dateRange: {
    start: Date;
    end?: Date;
    isOngoing: boolean;
  };
  memberCount: number;
  userStatus:
    | "member"
    | "pending"
    | "pending_request"
    | "blocked"
    | "declined"
    | null;
  creator: {
    name: string;
    username: string;
    avatar?: string;
  };
  creatorId: string;
  created_at: string;
  cover_image?: string;
  status?: "active" | "pending" | "removed";
  budget?: number;
}

export interface FiltersState {
  destination: string;
  dateStart: Date | undefined;
  dateEnd: Date | undefined;
  ageMin: number;
  ageMax: number;
  gender: string;
  interests: string[];
  personality: string;
  smoking: string;
  drinking: string;
  budgetRange: string;
  nationality: string;
  languages: string[];
}

/**
 * Fetch solo travelers via centralized Matching API
 */
export const fetchSoloTravelers = async (
  currentUserId: string,
  filters: FiltersState,
  cursor: string | null = null,
  limit: number = 20,
): Promise<{ data: Traveler[]; nextCursor: string | null; meta?: any }> => {
  try {
    const queryParams = new URLSearchParams();
    if (filters.destination && filters.destination !== "Any") queryParams.append("destination", filters.destination);
    if (filters.gender && filters.gender !== "Any") queryParams.append("gender", filters.gender);
    if (filters.ageMin) queryParams.append("ageMin", filters.ageMin.toString());
    if (filters.ageMax) queryParams.append("ageMax", filters.ageMax.toString());
    if (filters.interests?.length) queryParams.append("interests", filters.interests.join(","));
    if (filters.languages?.length) queryParams.append("languages", filters.languages.join(","));
    if (filters.personality && filters.personality !== "Any") queryParams.append("personality", filters.personality);
    if (filters.smoking && filters.smoking !== "No") queryParams.append("smoking", filters.smoking);
    if (filters.drinking && filters.drinking !== "No") queryParams.append("drinking", filters.drinking);
    if (filters.budgetRange) queryParams.append("budgetRange", filters.budgetRange);
    if (cursor) queryParams.append("cursor", cursor);
    queryParams.append("limit", limit.toString());

    const response = await fetch(`/api/match-solo?${queryParams.toString()}`);
    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.error?.message || errorJson.message || "Failed to fetch matches";
      throw new Error(`${message} (${response.status})`);
    }

    const result = await response.json();
    const matches = result.data?.matches || [];

    const mapped: any[] = matches.map((item: any) => {
      const score = item.compatibility_score || item.compatibilityScore || 0;
      let strength: "high" | "medium" | "low" = "low";
      if (score > 0.8) strength = "high";
      else if (score > 0.4) strength = "medium";

      // Preserve the full server-side transformed object, 
      // just augment with match-specific UI properties
      return {
        ...item,
        matchStrength: strength,
        // Ensure legacy fields used by some components are still there
        travelDates: item.travelDates || `${new Date(item.start_date).toLocaleDateString()} - ${new Date(item.end_date).toLocaleDateString()}`,
      };
    });

    return { 
      data: mapped, 
      nextCursor: mapped.length === limit ? mapped[mapped.length - 1].created_at : null,
      meta: result.meta 
    };
  } catch (error) {
    console.error("fetchSoloTravelers API Error:", error);
    return { data: [], nextCursor: null };
  }
};

/**
 * Fetch public groups via centralized Matching API
 */
export const fetchPublicGroups = async (
  currentUserId: string,
  filters: FiltersState,
  cursor: string | null = null,
  limit: number = 20,
): Promise<{ data: Group[]; nextCursor: string | null; meta?: any }> => {
  try {
    const response = await fetch("/api/match-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...filters,
        cursor,
        limit
      })
    });

    if (!response.ok) throw new Error("Failed to fetch group matches");

    const result = await response.json();
    const groups = result.data?.groups || [];

    const mapped: Group[] = groups.map((g: any) => {
      return {
        ...g, // Preserve the entire backend representation (scores, ML details, breakdown, etc)
        id: g.id,
        name: g.name,
        privacy: g.is_public ? "public" : g.privacy || "public",
        destination: g.destination,
        dateRange: {
          start: g.startDate ? new Date(g.startDate) : new Date(),
          end: g.endDate ? new Date(g.endDate) : undefined,
          isOngoing: !g.endDate,
        },
        memberCount: g.membersCount || g.members?.length || 0,
        userStatus: g.userStatus || null,
        creator: g.creator || { name: "Unknown", username: "unknown" },
        creatorId: g.creatorId,
        created_at: g.created_at || new Date().toISOString(),
        cover_image: g.cover_image || g.coverImage || g.image || g.avatar,
      };
    });

    return { 
      data: mapped, 
      nextCursor: mapped.length === limit ? (mapped[mapped.length - 1] as any).created_at : null,
      meta: result.meta 
    };
  } catch (error) {
    console.error("fetchPublicGroups API Error:", error);
    return { data: [], nextCursor: null };
  }
};

/**
 * Legacy: Keep fetchMyGroups unchanged as it is not a "matching" discovery feature
 */
import { createClient, createClientWithAuth } from "@kovari/api/client";
export const fetchMyGroups = async (
  clerkUserId: string,
  limit: number = 20,
  supabaseToken?: string | null,
): Promise<{ data: Group[]; nextCursor: string | null }> => {
  const supabase = supabaseToken
    ? createClientWithAuth(supabaseToken)
    : createClient();

  const { data: userData } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .eq("isDeleted", false)
    .single();

  if (!userData) return { data: [], nextCursor: null };
  const internalUserId = userData.id;

  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", internalUserId)
    .eq("status", "accepted");

  const groupIds = (memberships || []).map((m) => m.group_id);
  if (groupIds.length === 0) return { data: [], nextCursor: null };

  const { data: groupsData, error: groupsError } = await supabase
    .from("groups")
    .select(`
      id, name, is_public, destination, start_date, end_date, creator_id, created_at, cover_image, members_count, status
    `)
    .in("id", groupIds)
    .in("status", ["active", "pending"])
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (groupsError || !groupsData) return { data: [], nextCursor: null };

  const creatorIds = [...new Set(groupsData.map((g) => g.creator_id))];
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("user_id, name, username, profile_photo")
    .in("user_id", creatorIds);

  const profilesMap = (profilesData || []).reduce((acc: any, profile) => {
    acc[profile.user_id] = profile;
    return acc;
  }, {});

  const mappedGroups: Group[] = groupsData.map((group) => {
    const creator = profilesMap[group.creator_id];
    return {
      id: group.id,
      name: group.name,
      privacy: group.is_public ? "public" : "private",
      destination: group.destination,
      dateRange: {
        start: new Date(group.start_date),
        end: group.end_date ? new Date(group.end_date) : undefined,
        isOngoing: !group.end_date,
      },
      memberCount: group.members_count || 0,
      userStatus: "member",
      creator: {
        name: creator?.name || "Unknown",
        username: creator?.username || "unknown",
        avatar: creator?.profile_photo,
      },
      creatorId: group.creator_id,
      created_at: group.created_at,
      cover_image: group.cover_image,
      status: group.status,
    };
  });

  return { 
    data: mappedGroups, 
    nextCursor: mappedGroups.length === limit ? mappedGroups[mappedGroups.length - 1].id : null 
  };
};
