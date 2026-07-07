import { supabaseAdmin } from "@kovari/api";

export interface ResetResult {
  success: boolean;
  message: string;
  error?: any;
}

export const BASELINE_FIXTURES: Record<string, {
  name: string;
  username: string;
  age: number;
  gender: string;
  nationality: string;
  job: string;
  bio: string;
  languages: string[];
  interests: string[];
  location: string;
  religion: string;
  smoking: string;
  drinking: string;
  personality: string;
  food_preference: string;
  travel_intentions: any[];
}> = {
  GENERAL: {
    name: "Test User Alpha",
    username: "test_alpha",
    age: 25,
    gender: "female",
    nationality: "Indian",
    job: "Software Engineer",
    bio: "General testing profile for Alpha scenarios.",
    languages: ["English", "Hindi"],
    interests: ["travel", "photography", "food"],
    location: "Mumbai",
    religion: "Hindu",
    smoking: "No",
    drinking: "Socially",
    personality: "Extrovert",
    food_preference: "Veg",
    travel_intentions: [
      { destination: "Goa", startDate: "2026-08-01", endDate: "2026-08-05" }
    ]
  },
  MATCHING: {
    name: "Test User Beta",
    username: "test_beta",
    age: 28,
    gender: "male",
    nationality: "Indian",
    job: "Designer",
    bio: "Matching scenario test profile.",
    languages: ["English"],
    interests: ["travel", "photography", "adventure"],
    location: "Mumbai",
    religion: "Agnostic",
    smoking: "No",
    drinking: "Socially",
    personality: "Ambivert",
    food_preference: "Veg",
    travel_intentions: [
      { destination: "Delhi", startDate: "2026-09-10", endDate: "2026-09-15" },
      { destination: "Mumbai", startDate: "2026-10-01", endDate: "2026-10-07" }
    ]
  },
  CHAT: {
    name: "Test User Gamma",
    username: "test_gamma",
    age: 30,
    gender: "female",
    nationality: "Indian",
    job: "Teacher",
    bio: "Messaging scenario test profile.",
    languages: ["English", "Hindi"],
    interests: ["travel", "culture", "history"],
    location: "Delhi",
    religion: "Hindu",
    smoking: "No",
    drinking: "No",
    personality: "Introvert",
    food_preference: "Veg",
    travel_intentions: []
  },
  GROUPS: {
    name: "Test User Delta",
    username: "test_delta",
    age: 27,
    gender: "male",
    nationality: "Indian",
    job: "Full Stack Developer",
    bio: "Group coordination test profile.",
    languages: ["English", "Hindi", "Telugu"],
    interests: ["nature", "photography", "hiking"],
    location: "Hyderabad",
    religion: "Agnostic",
    smoking: "No",
    drinking: "Socially",
    personality: "Ambivert",
    food_preference: "Non-Veg",
    travel_intentions: [
      { destination: "Manali", startDate: "2026-07-20", endDate: "2026-07-27" }
    ]
  },
  EDGE_CASE: {
    name: "Test User Omega",
    username: "test_omega",
    age: 29,
    gender: "female",
    nationality: "Indian",
    job: "Architect",
    bio: "Edge case testing profile with multiple interests and long bio descriptions.",
    languages: ["English", "French", "Konkani"],
    interests: ["architecture", "art", "design", "hiking", "scuba", "beach", "history", "street food crawls", "local markets", "nightlife"],
    location: "Goa",
    religion: "Christian",
    smoking: "Yes",
    drinking: "Socially",
    personality: "Introvert",
    food_preference: "Veg",
    travel_intentions: []
  },
  RETENTION: {
    name: "Test User Epsilon",
    username: "test_epsilon",
    age: 26,
    gender: "male",
    nationality: "Indian",
    job: "Product Manager",
    bio: "Retention and push notification test profile.",
    languages: ["English"],
    interests: ["sports", "business", "books"],
    location: "Bangalore",
    religion: "Hindu",
    smoking: "No",
    drinking: "Socially",
    personality: "Extrovert",
    food_preference: "Veg",
    travel_intentions: []
  }
};

export class TestingResetService {
  /**
   * Reset profile parameters back to role baseline fixtures
   */
  public static async resetProfile(userId: string, role: string): Promise<ResetResult> {
    try {
      const fixture = BASELINE_FIXTURES[role];
      if (!fixture) {
        return { success: false, message: `No fixture found for role: ${role}` };
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          name: fixture.name,
          username: fixture.username,
          age: fixture.age,
          gender: fixture.gender,
          nationality: fixture.nationality,
          job: fixture.job,
          bio: fixture.bio,
          languages: fixture.languages,
          interests: fixture.interests,
          location: fixture.location,
          religion: fixture.religion,
          smoking: fixture.smoking,
          drinking: fixture.drinking,
          personality: fixture.personality,
          food_preference: fixture.food_preference,
          travel_intentions: fixture.travel_intentions,
          profile_photo: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&crop=face` // default test avatar
        })
        .eq("user_id", userId);

      if (profileError) throw profileError;

      // Update name in users table as well
      const { error: userError } = await supabaseAdmin
        .from("users")
        .update({ name: fixture.name })
        .eq("id", userId);

      if (userError) throw userError;

      return { success: true, message: `Profile reset to ${role} baseline.` };
    } catch (err: any) {
      return { success: false, message: "Failed to reset profile", error: err.message || err };
    }
  }

  /**
   * Reset onboarding flags to false
   */
  public static async resetOnboarding(userId: string): Promise<ResetResult> {
    try {
      const { error } = await supabaseAdmin
        .from("users")
        .update({
          onboarding_completed: false,
          onboarding_tour_completed: false
        })
        .eq("id", userId);

      if (error) throw error;
      return { success: true, message: "Onboarding flags reset successfully." };
    } catch (err: any) {
      return { success: false, message: "Failed to reset onboarding", error: err.message || err };
    }
  }

  /**
   * Clear all chats and messages
   */
  public static async resetChats(userId: string): Promise<ResetResult> {
    try {
      // 1. Delete direct messages
      await supabaseAdmin
        .from("direct_messages")
        .delete()
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      // 2. Delete group messages sent by user
      await supabaseAdmin
        .from("group_messages")
        .delete()
        .eq("sender_id", userId);

      return { success: true, message: "Conversations and messages cleared successfully." };
    } catch (err: any) {
      return { success: false, message: "Failed to clear chats", error: err.message || err };
    }
  }

  /**
   * Clear matches and interests
   */
  public static async resetMatches(userId: string): Promise<ResetResult> {
    try {
      // 1. Clear matches
      await supabaseAdmin
        .from("matches")
        .delete()
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

      // 2. Clear interests
      await supabaseAdmin
        .from("match_interests")
        .delete()
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

      // 3. Clear skips
      await supabaseAdmin
        .from("match_skips")
        .delete()
        .eq("user_id", userId);

      return { success: true, message: "Matches and matching interactions cleared." };
    } catch (err: any) {
      return { success: false, message: "Failed to clear matches", error: err.message || err };
    }
  }

  /**
   * Clear group memberships, invite links and groups created by the user
   */
  public static async resetGroups(userId: string): Promise<ResetResult> {
    try {
      // 1. Delete memberships
      await supabaseAdmin
        .from("group_memberships")
        .delete()
        .eq("user_id", userId);

      // 2. Retrieve groups created by the user
      const { data: createdGroups } = await supabaseAdmin
        .from("groups")
        .select("id")
        .eq("creator_id", userId);

      if (createdGroups && createdGroups.length > 0) {
        const groupIds = createdGroups.map((g: any) => g.id);

        // Delete group memberships for those groups
        await supabaseAdmin
          .from("group_memberships")
          .delete()
          .in("group_id", groupIds);

        // Delete invite links for those groups
        await supabaseAdmin
          .from("group_invite_links")
          .delete()
          .in("group_id", groupIds);

        // Delete group messages for those groups
        await supabaseAdmin
          .from("group_messages")
          .delete()
          .in("group_id", groupIds);

        // Finally delete the groups
        await supabaseAdmin
          .from("groups")
          .delete()
          .in("id", groupIds);
      }

      return { success: true, message: "Groups and memberships reset successfully." };
    } catch (err: any) {
      return { success: false, message: "Failed to reset groups", error: err.message || err };
    }
  }

  /**
   * Clear notifications
   */
  public static async resetNotifications(userId: string): Promise<ResetResult> {
    try {
      const { error } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
      return { success: true, message: "Notifications cleared." };
    } catch (err: any) {
      return { success: false, message: "Failed to reset notifications", error: err.message || err };
    }
  }

  /**
   * Clear follows
   */
  public static async resetFollows(userId: string): Promise<ResetResult> {
    try {
      await supabaseAdmin
        .from("user_follows")
        .delete()
        .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

      return { success: true, message: "Followers and following links cleared." };
    } catch (err: any) {
      return { success: false, message: "Failed to reset follows", error: err.message || err };
    }
  }

  /**
   * Reset everything to clean baseline state
   */
  public static async resetEverything(userId: string, role: string): Promise<ResetResult> {
    try {
      await this.resetChats(userId);
      await this.resetMatches(userId);
      await this.resetGroups(userId);
      await this.resetNotifications(userId);
      await this.resetFollows(userId);
      
      // Delete any reports
      await supabaseAdmin
        .from("user_flags")
        .delete()
        .or(`reporter_id.eq.${userId},user_id.eq.${userId}`);

      await this.resetProfile(userId, role);
      await this.resetOnboarding(userId);

      // Force logout by deleting socket sessions
      await supabaseAdmin
        .from("socket_sessions")
        .delete()
        .eq("user_id", userId);

      return { success: true, message: "All test account data reset to clean baseline fixture state." };
    } catch (err: any) {
      return { success: false, message: "Destructive reset failed", error: err.message || err };
    }
  }
}
