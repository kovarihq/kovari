import { UserProfile } from "@/features/profile/components/user-profile";
import type { UserProfile as UserProfileType } from "@/features/profile/components/user-profile";
import { createAdminSupabaseClient } from "@kovari/api";
import { auth } from "@clerk/nextjs/server";


interface ProfilePageProps {
  params: Promise<{ userId: string }>;
}

// Utility to map Clerk ID to internal UUID
const getInternalUserId = async (userId: string): Promise<string> => {
  console.log("[DEBUG] getInternalUserId input:", userId);
  if (userId.length === 36) {
    console.log("[DEBUG] getInternalUserId output (already UUID):", userId);
    return userId; // Already a UUID
  }
  const supabase = createAdminSupabaseClient();

  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();
  console.log("[DEBUG] getInternalUserId output (mapped):", userRow?.id);
  return userRow?.id || userId;
};

// Fetch user profile directly (SSR)
const fetchUserProfile = async (
  userId: string,
): Promise<UserProfileType | null> => {
  try {
    const supabase = createAdminSupabaseClient();
    const { userId: clerkUserId } = await auth();

    // 1. Fetch profile and target user details in parallel
    const [profileRes, targetUserRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          `name, username, age, gender, nationality, bio, languages, profile_photo, job, location, religion, smoking, drinking, personality, food_preference, birthday, verified, interests`,
        )
        .eq("user_id", userId)
        .single(),
      supabase
        .from("users")
        .select("id, is_internal, email")
        .eq("id", userId)
        .single()
    ]);

    const profileData = profileRes.data;
    const targetUser = targetUserRes.data;

    if (profileRes.error || !profileData || targetUserRes.error || !targetUser) {
      console.error("[DEBUG] profileError or targetUserError:", profileRes.error || targetUserRes.error);
      return null;
    }

    // 2. Enforce visibility rules for internal accounts
    if (targetUser.is_internal) {
      let isCallerAllowed = false;
      if (clerkUserId) {
        const { data: currentUserRow } = await supabase
          .from("users")
          .select("id, is_internal, email")
          .eq("clerk_user_id", clerkUserId)
          .single();

        if (currentUserRow) {
          const isOwnProfile = currentUserRow.id === userId;
          const isCallerInternal = currentUserRow.is_internal || false;
          
          let isCallerAdmin = false;
          if (currentUserRow.email) {
            const { data: adminRow } = await supabase
              .from("admins")
              .select("id")
              .eq("email", currentUserRow.email.toLowerCase())
              .maybeSingle();
            isCallerAdmin = !!adminRow;
          }

          if (isOwnProfile || isCallerInternal || isCallerAdmin) {
            isCallerAllowed = true;
          }
        }
      }

      if (!isCallerAllowed) {
        console.warn(`[Profile View Suppressed] Public user tried to view internal profile: ${userId}`);
        return null;
      }
    }

    const interests = profileData?.interests || [];

    // 3. Fetch posts from user_posts
    // const { data: postsData } = await supabase
    //   .from("user_posts")
    //   .select("id, image_url")
    //   .eq("user_id", userId)
    //   .order("created_at", { ascending: false });

    const posts: any[] = [];

    // 4. Count followers/following (exclude soft-deleted users)
    // We keep follow rows for history/analytics, so counts must filter deleted accounts.
    const [
      { data: followerRows, error: followerErr },
      { data: followingRows, error: followingErr },
    ] = await Promise.all([
      supabase
        .from("user_follows")
        .select("follower_id")
        .eq("following_id", userId),
      supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", userId),
    ]);

    if (followerErr || followingErr) {
      console.error("Error fetching follow ids:", {
        followerErr,
        followingErr,
      });
      return null;
    }

    const followerIds = (followerRows || []).map((r: any) => r.follower_id);
    const followingIds = (followingRows || []).map((r: any) => r.following_id);

    const [{ count: followersCount }, { count: followingCount }] =
      await Promise.all([
        followerIds.length
          ? supabase
              .from("users")
              .select("id", { count: "exact", head: true })
              .in("id", followerIds)
              .eq("isDeleted", false)
          : Promise.resolve({ count: 0 } as any),
        followingIds.length
          ? supabase
              .from("users")
              .select("id", { count: "exact", head: true })
              .in("id", followingIds)
              .eq("isDeleted", false)
          : Promise.resolve({ count: 0 } as any),
      ]);

    // 6. Count posts and sum likes
    // const { count: postsCount, data: postsLikesData } = await supabase
    //   .from("user_posts")
    //   .select("likes", { count: "exact" })
    //   .eq("user_id", userId);

    const likesSum = 0;
    //   postsLikesData?.reduce((acc, post) => acc + (post.likes || 0), 0) || 0;

    // 7. Check if current user is following this user and check active reports
    let isFollowing = false;
    let isOwnProfile = false;
    let hasActiveReport = false;

    try {
      const { userId: clerkUserId } = await auth();
      console.log("[DEBUG] clerkUserId:", clerkUserId);

      if (clerkUserId) {
        // Get current user's internal UUID from Clerk userId
        const { data: currentUserRow, error: currentUserError } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_user_id", clerkUserId)
          .single();

        console.log(
          "[DEBUG] currentUserRow.id (follower):",
          currentUserRow?.id,
        );
        console.log("[DEBUG] currentUserError:", currentUserError);

        if (currentUserError || !currentUserRow) {
          console.error("Error finding current user:", currentUserError);
        } else {
          isOwnProfile = currentUserRow.id === userId;

          if (!isOwnProfile) {
            // Check if current user is following the target user
            const [followDataResult, reportDataResult] = await Promise.all([
              supabase
                .from("user_follows")
                .select("id")
                .eq("follower_id", currentUserRow.id)
                .eq("following_id", userId)
                .maybeSingle(),
              supabase
                .from("user_flags")
                .select("id")
                .eq("reporter_id", currentUserRow.id)
                .eq("user_id", userId)
                .neq("status", "dismissed")
                .maybeSingle()
            ]);

            isFollowing = !!followDataResult.data;
            hasActiveReport = !!reportDataResult.data;
          }
        }
      }
    } catch (error) {
      console.error("Error checking follow/report status:", error);
      // Continue without status if there's an error
    }

    // 8. Map to UserProfileType
    return {
      name: profileData.name || "",
      username: profileData.username || "",
      age: profileData.age ? String(profileData.age) : "",
      gender: profileData.gender || "",
      nationality: profileData.nationality || "",
      profession: profileData.job || "",
      interests,
      languages: profileData.languages || [],
      bio: profileData.bio || "",
      followers: String(followersCount ?? 0),
      following: String(followingCount ?? 0),
      likes: String(likesSum),
      coverImage: "", // Not in schema, leave blank or fetch if you add it
      profileImage: profileData.profile_photo || "",
      posts,
      isFollowing,
      isOwnProfile,
      hasActiveReport,
      location: profileData.location || "Surat",
      religion: profileData.religion || "Hindu",
      smoking: profileData.smoking || "No",
      drinking: profileData.drinking || "No",
      personality: profileData.personality || "Ambivert",
      foodPreference: profileData.food_preference || "Veg",
      userId,
    };
  } catch (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
};

export default async function ProfileUserPage({ params }: ProfilePageProps) {
  const resolvedParams = await params;
  let { userId } = resolvedParams;
  userId = await getInternalUserId(userId);
  console.log("[DEBUG] Final userId used for profile fetch:", userId);
  const profile = await fetchUserProfile(userId);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-semibold mb-2">User Not Found</h2>
        <p className="text-muted-foreground">
          The profile you are looking for does not exist.
        </p>
      </div>
    );
  }

  // Add userId to the profile object
  const profileWithUserId = {
    ...profile,
    userId,
  };

  return <UserProfile profile={profileWithUserId} />;
}
