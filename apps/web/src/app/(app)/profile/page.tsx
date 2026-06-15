export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { UserProfile } from "@/features/profile/components/user-profile";
import type { UserProfile as UserProfileType } from "@/features/profile/components/user-profile";
import { createAdminSupabaseClient } from "@kovari/api";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { CardContent } from "@/shared/components/ui/card";
import { Card, Skeleton } from "@heroui/react";

// Loading component specific to profile page
const ProfileLoading = () => {
  return (
    <>
      {/* Mobile/Tablet Layout */}
      <div className="min-h-screen bg-background md:hidden">
        <Card className="w-full mx-auto bg-transparent border-none rounded-none gap-3 shadow-none p-3">
          {/* Profile Information Section */}
          <Card className="rounded-none border-none shadow-none bg-transparent p-0">
            <CardContent className="p-0">
              <div className="flex flex-row items-stretch gap-4">
                <Card className="flex rounded-3xl bg-card border border-border shadow-none p-4 items-start justify-start flex-1 min-w-0">
                  <div className="flex flex-row items-center gap-x-6 w-full mb-4 mt-3">
                    <div className="flex flex-row justify-start items-center flex-1 min-w-0 gap-x-4">
                      <div className="flex flex-col">
                        <Skeleton className="h-[70px] w-[70px] rounded-full" />
                      </div>
                      <div className="flex flex-col">
                        <Skeleton className="h-3 w-24 rounded-full mb-2" />
                        <Skeleton className="h-3 w-20 rounded-full mb-2" />
                      </div>
                    </div>
                  </div>

                  <Skeleton className="h-3 w-1/2 rounded-full mb-2" />
                  <Skeleton className="h-3 w-full rounded-full mb-2" />

                  <div className="flex flex-row justify-start items-center flex-1 gap-x-1.5 mt-4 w-full">
                    <Skeleton className="h-8 w-1/2 rounded-lg" />
                    <Skeleton className="h-8 w-1/2 rounded-lg" />
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card
            aria-label="User details"
            className="w-full rounded-3xl bg-card shadow-none p-4 flex flex-col gap-6 border border-border mx-auto"
          >
            <Skeleton className="w-1/5 rounded-full h-3 mt-2 mb-1"></Skeleton>

            <Card className="rounded-none border-none shadow-none bg-transparent p-0">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 9 }).map((post, index) => (
                    <div
                      key={index}
                      className="aspect-[4/5] bg-muted rounded-none overflow-hidden flex items-center justify-center shadow-sm"
                    >
                      <Skeleton className="w-full h-full object-cover rounded-none"></Skeleton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Card>
        </Card>
      </div>

      {/* Desktop Layout */}
      <div className="min-h-screen bg-background hidden md:block">
        <Card className="w-full mx-auto bg-transparent border-none rounded-none gap-4 shadow-none p-5">
          {/* Profile Information Section */}
          <Card className="rounded-none border-none shadow-none p-0 bg-transparent">
            <CardContent className="p-0">
              <div className="flex flex-row items-stretch gap-4">
                {/* Profile Avatar Overlay - Stretches to match second card height */}
                <Skeleton className="rounded-3xl w-[200px] h-[200px] min-[840px]:h-[180px] min-[840px]:w-[180px] flex-shrink-0"></Skeleton>

                <Card className="flex rounded-3xl bg-card border border-border h-[200px] min-[840px]:h-[180px] shadow-none p-6 py-5 items-start justify-start flex-1 min-w-0">
                  <Skeleton className="h-4 w-1/5 rounded-full mb-2 mt-6" />
                  <Skeleton className="h-4 w-1/6 rounded-full mb-5" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card
            aria-label="User details"
            className="w-full rounded-3xl bg-card shadow-none p-6 flex flex-col gap-6 border border-border mx-auto"
          >
            <Skeleton className="w-1/6 rounded-full h-4 mt-2 mb-1"></Skeleton>

            <Card className="rounded-none border-none shadow-none bg-transparent p-0">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((post, index) => (
                    <div
                      key={index}
                      className="aspect-[4/5] bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-sm"
                    >
                      <Skeleton className="w-full h-full object-cover"></Skeleton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Card>
        </Card>
      </div>
    </>
  );
};

// Fetch current user's profile directly from Supabase (SSR)
const fetchCurrentUserProfile = async (): Promise<UserProfileType | null> => {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      redirect("/sign-in");
    }

    const supabase = createAdminSupabaseClient();

    // Get user UUID from Clerk userId
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (userError) {
      console.error(
        "Error finding user:",
        JSON.stringify(userError, null, 2)
      );
      return null;
    } else if (!userRow) {
      console.warn("Current user not found in database (sync issue?)");
      return null;
    }

    const userId = userRow.id;

    // 1. Fetch profile (include interests from profiles)
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(
        `name, username, age, gender, nationality, bio, languages, profile_photo, job, interests, location, religion, smoking, drinking, personality, food_preference, birthday, verified`
      )
      .eq("user_id", userId)
      .single();

    if (profileError || !profileData) {
      console.error("Error fetching profile:", profileError);
      return null;
    }

    const interests = profileData?.interests || [];

    // 2. Fetch posts from user_posts
    // const { data: postsData } = await supabase
    //   .from("user_posts")
    //   .select("id, image_url")
    //   .eq("user_id", userId)
    //   .order("created_at", { ascending: false });

    // const posts = Array.isArray(postsData) ? postsData : [];
    const posts: any[] = [];


    // 3. Count followers/following (exclude soft-deleted users)
    // We keep follow rows for history/analytics, so counts must filter deleted accounts.
    // Optimized follow counts using inner joins to filter deleted users directly in the database
    const [{ count: followersCount, error: followerErr }, { count: followingCount, error: followingErr }] =
      await Promise.all([
        supabase
          .from("user_follows")
          .select("follower_id!inner(isDeleted)", { count: "exact", head: true })
          .eq("following_id", userId)
          .eq("follower_id.isDeleted", false),
        supabase
          .from("user_follows")
          .select("following_id!inner(isDeleted)", { count: "exact", head: true })
          .eq("follower_id", userId)
          .eq("following_id.isDeleted", false)
      ]);

    if (followerErr || followingErr) {
      console.error("Error fetching follow counts:", { followerErr, followingErr });
      return null;
    }

    // 5. Count posts and sum likes
    // const { count: postsCount, data: postsLikesData } = await supabase
    //   .from("user_posts")
    //   .select("likes", { count: "exact" })
    //   .eq("user_id", userId);

    const likesSum = 0;
    //   postsLikesData?.reduce((acc, post) => acc + (post.likes || 0), 0) || 0;


    // 6. Map to UserProfileType
    return {
      name: profileData.name || "",
      username: profileData.username || "",
      age: profileData.age ? String(profileData.age) : "",
      gender: profileData.gender || "",
      nationality: profileData.nationality || "",
      profession: profileData.job || "",
      interests: Array.isArray(interests) ? interests : [],
      languages: Array.isArray(profileData.languages)
        ? profileData.languages
        : [],
      bio: profileData.bio || "",
      followers: String(followersCount ?? 0),
      following: String(followingCount ?? 0),
      likes: String(likesSum),
      coverImage: "", // Not in DB, leave blank
      profileImage: profileData.profile_photo || "",
      posts,
      isFollowing: false, // Always false for own profile
      isOwnProfile: true, // Always true for own profile
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

export default async function ProfilePage() {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileContent />
    </Suspense>
  );
}

// Separate component for the actual profile content
async function ProfileContent() {
  const profile = await fetchCurrentUserProfile();

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-semibold mb-2">Profile Not Found</h2>
        <p className="text-muted-foreground">
          Unable to load your profile. Please try again.
        </p>
      </div>
    );
  }

  // Add userId to the profile object (we need to get it from the API response)
  const profileWithUserId = {
    ...profile,
    userId: profile.userId || "", // This will be set by the API
    isOwnProfile: true, // Force true for own profile page
  };

  // Debug log
  console.log("[DEBUG] ProfilePage - profileWithUserId:", profileWithUserId);

  return <UserProfile profile={profileWithUserId} />;
}


