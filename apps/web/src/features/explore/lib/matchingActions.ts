/**
 * Matching Actions Library
 * Handles all MVP matching system interactions with Supabase
 * Uses actual schema: match_interests, match_skips, matches, user_flags, group_flags tables
 */

import { createClient } from "@kovari/api/client";

// Helper: resolve a given identifier to the user's UUID stored in `users.id`.
// Accepts either a UUID string or a Clerk ID like "user_xxx" and returns the UUID.
async function resolveUserUuid(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  // Simple UUID v4-ish check
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (uuidRegex.test(identifier)) return identifier;

  if (uuidRegex.test(identifier)) return identifier;

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, clerk_user_id")
      .eq("clerk_user_id", identifier)
      .eq("isDeleted", false)
      .maybeSingle();

    if (error) {
      console.warn("Error resolving clerk id to uuid:", error.message || error);
      return null;
    }
    if (!data || !data.id) return null;
    return data.id;
  } catch (err) {
    console.error("Unexpected error resolving user id:", err);
    return null;
  }
}

/**
 * Create a solo interest record when user clicks "Interested" on another profile
 */
export async function createSoloInterest(
  fromUserId: string,
  toUserId: string,
  destinationId: string
): Promise<{ success: boolean; interestId?: string; error?: string }> {
  try {
    const dest = destinationId || "Global";
    // Validate params before calling server API
    if (!fromUserId || !toUserId || !dest) {
      console.error("createSoloInterest: missing parameter", {
        fromUserId,
        toUserId,
        destinationId: dest,
      });
      return { success: false, error: "Missing parameters" };
    }

    // Use server-side API to resolve Clerk IDs and perform the DB write
    try {
      const resp = await fetch("/api/matching/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId, toUserId, destinationId: dest }),
      });
      const json = await resp.json();
      if (!json.success) {
        console.error("createSoloInterest server error:", json);
        return { success: false, error: json.error || json.message };
      }
      return { success: true, interestId: json.interestId };
    } catch (err: any) {
      console.error("Error calling server interest API:", err);
      return { success: false, error: err?.message || String(err) };
    }
  } catch (error) {
    console.error("Unexpected error in createSoloInterest:", error);
    return {
      success: false,
      error: "Unexpected error expressing interest",
    };
  }
}

/**
 * Create a group interest record when user clicks "Interested" on a group
 * Note: For now, treating group interest as interest in other group members
 * Full group matching logic can be implemented later
 */
export async function createGroupInterest(
  fromUserId: string,
  toGroupId: string,
  destinationId: string
): Promise<{ success: boolean; interestId?: string; error?: string }> {
  try {
    const dest = destinationId || "Global";
    // Validate params
    if (!fromUserId || !toGroupId || !dest) {
      console.error("createGroupInterest: missing parameter", {
        fromUserId,
        toGroupId,
        destinationId: dest,
      });
      return { success: false, error: "Missing parameters" };
    }

    // Call API to create group interest and join request
    const resp = await fetch("/api/groups/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId, toGroupId, destinationId: dest }),
    });

    if (!resp.ok) {
      const errorData = await resp.json();
      console.error("createGroupInterest: API returned error status", errorData);
      return {
        success: false,
        error: errorData.error || "Failed to create group interest",
      };
    }

    const data = await resp.json();
    return {
      success: true,
      interestId: data.interestId,
    };
  } catch (error) {
    console.error("Unexpected error in createGroupInterest:", error);
    return {
      success: false,
      error: "Unexpected error with group interest",
    };
  }
}

/**
 * Check for mutual interest and create a match if both users are interested in each other
 */
async function checkAndCreateMatch(
  userId1: string,
  userId2: string,
  destinationId: string,
  type: "solo" | "group"
): Promise<void> {
  try {
    const supabase = createClient();
    // Look for reverse interest (userId2 interested in userId1)
    const { data: reverseInterest, error: selectError } = await supabase
      .from("match_interests")
      .select("id")
      .eq("from_user_id", userId2)
      .eq("to_user_id", userId1)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo")
      .eq("status", "pending")
      .maybeSingle();

    if (selectError) {
      console.warn("Warning checking for reverse interest:", {
        message: selectError.message,
        code: selectError.code,
      });
      return;
    }

    if (reverseInterest) {
      // Mutual interest found! Create a match
      // Ensure alphabetical order for user IDs (required by schema)
      const userA = userId1 < userId2 ? userId1 : userId2;
      const userB = userId1 < userId2 ? userId2 : userId1;

      // Update both interests to "accepted"
      await supabase
        .from("match_interests")
        .update({ status: "accepted" })
        .eq("from_user_id", userId1)
        .eq("to_user_id", userId2)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo");

      await supabase
        .from("match_interests")
        .update({ status: "accepted" })
        .eq("from_user_id", userId2)
        .eq("to_user_id", userId1)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo");

      // Create the match record
      const { error: matchError } = await supabase.from("matches").insert([
        {
          user_a_id: userA,
          user_b_id: userB,
          destination_id: destinationId,
          match_type: "solo",
          status: "active",
        },
      ]);

      if (matchError) {
        console.error("Error creating match - Full error details:", {
          message: matchError.message,
          code: matchError.code,
          details: matchError.details,
          hint: matchError.hint,
        });
      } else {
        console.log(`✅ Match created between ${userA} and ${userB}`);
      }
    }
  } catch (error) {
    console.error("Unexpected error checking for mutual interest:", error);
  }
}

/**
 * Create a skip record when a user skips/dismisses a profile
 */
export async function createSkipRecord(
  skipperId: string,
  skippedUserId: string,
  destinationId: string,
  type: "solo" | "group" = "solo"
): Promise<{ success: boolean; error?: string }> {
  try {
    const dest = destinationId || "Global";
    // Validate params before calling server API
    if (!skipperId || !skippedUserId || !dest) {
      console.error("createSkipRecord: missing parameter", {
        skipperId,
        skippedUserId,
        destinationId: dest,
      });
      return { success: false, error: "Missing parameters" };
    }

    // Use server-side API to resolve Clerk IDs and perform the DB write
    try {
      const resp = await fetch("/api/matching/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipperId, skippedUserId, destinationId: dest, type }),
      });

      if (!resp.ok) {
        console.error("createSkipRecord: API returned error status", {
          status: resp.status,
          statusText: resp.statusText,
        });
        const errorData = await resp.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Server error: ${resp.status}`,
        };
      }

      const json = await resp.json();
      if (!json.success) {
        console.error("createSkipRecord server error:", json);
        return {
          success: false,
          error: json.error || json.message || "Failed to skip",
        };
      }
      return { success: true };
    } catch (err: any) {
      console.error("Error calling server skip API:", {
        message: err?.message,
        stack: err?.stack,
      });
      return { success: false, error: err?.message || "Network error" };
    }
  } catch (error) {
    console.error("Unexpected error in createSkipRecord:", error);
    return {
      success: false,
      error: "Unexpected error skipping profile",
    };
  }
}

/**
 * Create a report record for safety purposes
 */
export async function createReportRecord(
  reporterId: string,
  reportedUserId: string,
  reason: string,
  type: "solo" | "group" = "solo",
  evidenceUrl?: string | null,
  evidencePublicId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate params before calling server API
    if (!reporterId || !reportedUserId || !reason) {
      console.error("createReportRecord: missing parameter", {
        reporterId,
        reportedUserId,
        reason,
      });
      return { success: false, error: "Missing parameters" };
    }

    // Use server-side API to resolve Clerk IDs and perform the DB write
    try {
      const resp = await fetch("/api/matching/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterId,
          reportedUserId,
          reason,
          type,
          evidenceUrl,
          evidencePublicId,
        }),
      });

      if (!resp.ok) {
        console.error("createReportRecord: API returned error status", {
          status: resp.status,
          statusText: resp.statusText,
        });
        const errorData = await resp.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Server error: ${resp.status}`,
        };
      }

      const json = await resp.json();
      if (!json.success) {
        console.error("createReportRecord server error:", json);
        return {
          success: false,
          error: json.error || json.message || "Failed to report",
        };
      }
      console.log(`📋 Report submitted for user ${reportedUserId}`);
      return { success: true };
    } catch (err: any) {
      console.error("Error calling server report API:", {
        message: err?.message,
        stack: err?.stack,
      });
      return { success: false, error: err?.message || "Network error" };
    }
  } catch (error) {
    console.error("Unexpected error in createReportRecord:", error);
    return {
      success: false,
      error: "Unexpected error creating report",
    };
  }
}

/**
 * Check if a user has already skipped a profile
 * Used to prevent showing skipped profiles again
 */
export async function hasSkippedProfile(
  userId: string,
  targetUserId: string,
  destinationId: string
): Promise<boolean> {
  try {
    const userUuid = await resolveUserUuid(userId);
    const targetUuid = await resolveUserUuid(targetUserId);
    if (!userUuid || !targetUuid) return false;

    if (!userUuid || !targetUuid) return false;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("match_skips")
      .select("id")
      .eq("user_id", userUuid)
      .eq("skipped_user_id", targetUuid)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo")
      .maybeSingle();

    if (error) {
      console.warn("Warning checking skip status:", {
        message: error.message,
        code: error.code,
      });
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Unexpected error checking skip status:", error);
    return false;
  }
}

/**
 * Get all matches for a user on a specific destination
 */
export async function getUserMatches(
  userId: string,
  destinationId: string
): Promise<any[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        user_a_id,
        user_b_id,
        destination_id,
        match_type,
        status,
        created_at
      `
      )
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .eq("destination_id", destinationId)
      .eq("status", "active");

    if (error) {
      console.error("Error fetching matches:", {
        message: error.message,
        code: error.code,
      });
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Unexpected error fetching matches:", error);
    return [];
  }
}

/**
 * Get interests received by a user (others interested in them)
 */
export async function getReceivedInterests(
  userId: string,
  destinationId: string
): Promise<any[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("match_interests")
      .select(
        `
        id,
        from_user_id,
        to_user_id,
        destination_id,
        match_type,
        status,
        created_at
      `
      )
      .eq("to_user_id", userId)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo")
      .eq("status", "pending");

    if (error) {
      console.error("Error fetching received interests:", {
        message: error.message,
        code: error.code,
      });
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Unexpected error fetching received interests:", error);
    return [];
  }
}

/**
 * Get interests sent by a user
 */
export async function getSentInterests(
  userId: string,
  destinationId: string
): Promise<any[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("match_interests")
      .select(
        `
        id,
        from_user_id,
        to_user_id,
        destination_id,
        match_type,
        status,
        created_at
      `
      )
      .eq("from_user_id", userId)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo");

    if (error) {
      console.error("Error fetching sent interests:", {
        message: error.message,
        code: error.code,
      });
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Unexpected error fetching sent interests:", error);
    return [];
  }
}

