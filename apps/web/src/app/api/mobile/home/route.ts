import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { createAdminSupabaseClient } from "@kovari/api";
import { isAfter, isBefore, parseISO } from "date-fns";
import { generateRequestId } from "@/lib/api/requestId";
import { formatStandardResponse, formatErrorResponse } from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";

/**
 * GET /api/mobile/home
 * Consolidated dashboard data for mobile home screen.
 * Replicates the logic from apps/web dashboard while remaining lightweight.
 */
export async function GET(req: NextRequest) {
    const start = Date.now();
    const requestId = generateRequestId();

    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
        return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);
    }

    const userId = authUser.id; // internal Supabase UUID
    const supabase = createAdminSupabaseClient();

    try {
        // 1. Check user status (banned/deleted)
        const { data: userStatus, error: statusError } = await supabase
            .from("users")
            .select("isDeleted, banned")
            .eq("id", userId)
            .single();

        if (statusError || !userStatus) {
            return formatErrorResponse("User not found", ApiErrorCode.NOT_FOUND, requestId, 404);
        }

        if (userStatus.isDeleted || userStatus.banned) {
            return formatErrorResponse("Account inactive", ApiErrorCode.FORBIDDEN, requestId, 403);
        }

        // 2. Parallel Data Fetching
        const [
            profileRes,
            membershipsRes,
            unreadNotificationsRes,
            pendingInvitesRes,
            recentNotificationsRes,
            impressionsRes,
            interestsRes,
        ] = await Promise.all([
            // Profile
            supabase
                .from("profiles")
                .select("name, username, profile_photo")
                .eq("user_id", userId)
                .single(),

            // Accepted Memberships & Group Details
            supabase
                .from("group_memberships")
                .select(`
          role,
          status,
          group:groups(
            id,
            name,
            destination,
            start_date,
            end_date,
            cover_image,
            destination_image,
            members_count,
            status
          )
        `)
                .eq("user_id", userId)
                .eq("status", "accepted"),

            // Unread Notifications Count
            supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("is_read", false)
                .neq("type", "NEW_MESSAGE"),

            // Pending Invitations Count
            supabase
                .from("group_memberships")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "pending"),

            // Recent Notifications (Top 5)
            supabase
                .from("notifications")
                .select("*")
                .eq("user_id", userId)
                .neq("type", "NEW_MESSAGE")
                .order("created_at", { ascending: false })
                .range(0, 4),

            // Profile Impressions Count
            supabase
                .from("profile_impressions")
                .select("id", { count: "exact", head: true })
                .eq("viewed_user_id", userId),

            // Pending Connection Requests (Solo Match Interests)
            supabase
                .from("match_interests")
                .select("id, from_user_id, destination_id, created_at, status")
                .eq("to_user_id", userId)
                .eq("match_type", "solo")
                .eq("status", "pending")
                .order("created_at", { ascending: false }),
        ]);

        // Handle generic errors
        if (membershipsRes.error) throw membershipsRes.error;

        const profile = profileRes.data;
        const allMemberships = membershipsRes.data || [];
        const unreadNotificationCount = unreadNotificationsRes.count || 0;
        const pendingInvitesCount = pendingInvitesRes.count || 0;
        const notificationsData = recentNotificationsRes.data || [];
        const profileImpressions = impressionsRes.count || 0;
        const pendingInterests = interestsRes.data || [];

        // 3. Stats & Analytics Calculation (Blueprint + Web Parity)
        const now = new Date();
        const travelDaysSet = new Set<string>();
        const destinationFrequency: Record<string, number> = {};

        const activeGroups = allMemberships
            .filter(m => m.group && (m.group as any).status !== 'removed')
            .map(m => {
                const g = m.group as any;
                
                // Track travel days
                if (g.start_date && g.end_date) {
                    const current = new Date(g.start_date);
                    const end = new Date(g.end_date);
                    if (!isNaN(current.getTime()) && !isNaN(end.getTime())) {
                        while (current <= end) {
                            travelDaysSet.add(current.toISOString().split("T")[0]);
                            current.setUTCDate(current.getUTCDate() + 1);
                        }
                    }
                }

                // Track destination frequency
                if (g.destination) {
                    destinationFrequency[g.destination] = (destinationFrequency[g.destination] || 0) + 1;
                }

                return {
                    id: g.id,
                    name: g.name,
                    role: m.role,
                    members: g.members_count,
                    destination: g.destination,
                    startDate: g.start_date,
                    endDate: g.end_date,
                    coverImage: g.cover_image,
                    destinationImage: g.destination_image
                };
            });

        // Determine Top Destination
        const sortedDestinations = Object.entries(destinationFrequency).sort((a, b) => b[1] - a[1]);
        const topDestinationName = sortedDestinations[0]?.[0] || null;
        let topDestination = null;

        if (topDestinationName) {
            const latestGroupForTopDest = activeGroups
                .filter(g => g.destination === topDestinationName)
                .sort((a, b) => b.startDate ? (a.startDate ? parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime() : -1) : 1)[0];
            
            const parts = topDestinationName.split(",").map(p => p.trim());
            topDestination = {
                name: parts[0] || topDestinationName,
                country: parts[1] || "",
                imageUrl: latestGroupForTopDest?.destinationImage || latestGroupForTopDest?.coverImage || null
            };
        }

        const upcomingGroups = activeGroups.filter(g => g.startDate && isAfter(parseISO(g.startDate), now));
        const pastGroups = activeGroups.filter(g => g.startDate && isBefore(parseISO(g.startDate), now));

        const stats = {
            totalTrips: activeGroups.length,
            upcomingTripsCount: upcomingGroups.length,
            pastTripsCount: pastGroups.length,
            totalTravelDays: travelDaysSet.size,
            profileImpressions: profileImpressions
        };

        // 4. Identify Featured Trip & Fetch Itinerary Summary
        const featuredTripBase = upcomingGroups.sort((a, b) =>
            parseISO(a.startDate!).getTime() - parseISO(b.startDate!).getTime()
        )[0] || pastGroups.sort((a, b) =>
            parseISO(b.startDate!).getTime() - parseISO(a.startDate!).getTime()
        )[0] || null;

        let featuredTrip = null;
        if (featuredTripBase) {
            const { data: itineraryItems } = await supabase
                .from("itinerary_items")
                .select("id, title, description, datetime, duration")
                .eq("group_id", featuredTripBase.id)
                .eq("is_archived", false)
                .order("datetime", { ascending: true })
                .range(0, 2); // Next 2-3 items

            featuredTrip = {
                ...featuredTripBase,
                itinerary: itineraryItems || []
            };
        }

        // 5. Enrich Notifications & Connection Requests
        const userIdsToFetch = new Set<string>();
        const groupIdsToFetch = new Set<string>();

        notificationsData.forEach((n) => {
            if (!n.entity_id) return;
            if (n.entity_type === "match" || n.entity_type === "chat") {
                userIdsToFetch.add(n.entity_id);
            } else if (n.entity_type === "group") {
                groupIdsToFetch.add(n.entity_id);
            }
        });

        pendingInterests.forEach(i => userIdsToFetch.add(i.from_user_id));

        const [profilesResult, groupsResult] = await Promise.all([
            userIdsToFetch.size > 0
                ? supabase
                    .from("profiles")
                    .select("user_id, name, username, profile_photo, location")
                    .in("user_id", Array.from(userIdsToFetch))
                : Promise.resolve({ data: [] }),
            groupIdsToFetch.size > 0
                ? supabase
                    .from("groups")
                    .select("id, cover_image, status")
                    .in("id", Array.from(groupIdsToFetch))
                : Promise.resolve({ data: [] }),
        ]);

        const profileMap = new Map();
        profilesResult.data?.forEach((p: any) => profileMap.set(p.user_id, p));

        const groupMap = new Map();
        groupsResult.data?.forEach((g: any) => {
            if (g?.status !== "removed") groupMap.set(g.id, g.cover_image);
        });

        const enrichedNotifications = notificationsData.map((n) => ({
            ...n,
            image_url: (n.entity_type === "match" || n.entity_type === "chat")
                ? profileMap.get(n.entity_id)?.profile_photo
                : groupMap.get(n.entity_id)
        }));

        const connectionRequests = pendingInterests.map(i => {
            const senderProfile = profileMap.get(i.from_user_id);
            return {
                id: i.id,
                sender: {
                    id: i.from_user_id,
                    name: senderProfile?.name || "Unknown User",
                    avatar: senderProfile?.profile_photo || "",
                    location: senderProfile?.location || "Unknown Location"
                },
                destination: i.destination_id,
                sentAt: i.created_at,
                status: "pending"
            };
        });

        // 6. Final Response
        return formatStandardResponse(
            {
                profile: {
                    name: profile?.name || "",
                    username: profile?.username || "",
                    avatar: profile?.profile_photo || "",
                },
                stats,
                topDestination,
                featuredTrip,
                recentNotifications: enrichedNotifications,
                unreadNotificationCount,
                activeGroups,
                pendingInvitesCount,
                connectionRequests
            },
            { contractState: 'clean', degraded: false },
            { requestId, latencyMs: Date.now() - start }
        );

    } catch (error: any) {
        console.error("Critical error in GET /api/mobile/home:", error);
        return formatErrorResponse("Internal server error", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }
}
