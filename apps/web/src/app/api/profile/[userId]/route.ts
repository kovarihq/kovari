import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth/resolveUser";
import { createAdminSupabaseClient, isProfileHiddenDueToBan } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
import { formatStandardResponse, formatErrorResponse } from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";
import { z } from "zod";
import { logger } from "@/lib/api/logger";
import { profileMapper } from "@/lib/mappers/profileMapper";

/**
 * 🛡️ Public Profile Contract Schema
 */
const PublicProfileSchema = z.object({
  name: z.string().default(""),
  username: z.string().default(""),
  age: z.string().default(""),
  gender: z.string().default(""),
  nationality: z.string().default(""),
  profession: z.string().default(""),
  interests: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  bio: z.string().default(""),
  followers: z.string().default("0"),
  following: z.string().default("0"),
  likes: z.string().default("0"),
  coverImage: z.string().default(""),
  profileImage: z.string().default(""),
  posts: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    image_url: z.string()
  })).default([]),
  isFollowing: z.boolean().default(false),
  isFollowingMe: z.boolean().default(false),
  isOwnProfile: z.boolean().default(false),
  hasActiveReport: z.boolean().default(false),
  location: z.string().default(""),
  religion: z.string().default(""),
  smoking: z.string().default(""),
  drinking: z.string().default(""),
  personality: z.string().default(""),
  foodPreference: z.string().default(""),
  userId: z.string()
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const start = Date.now();
  const requestId = generateRequestId();
  const { userId } = await context.params;
  const supabase = createAdminSupabaseClient();

  // 1. Detect if ID is a UUID or Clerk ID
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const isUuid = uuidRegex.test(userId);

  // 2. Unified Fetch: users + profiles (LEFT JOIN)
  const { data: dbUser, error: dbError } = await supabase
    .from("users")
    .select("*, profiles(*)")
    .eq(isUuid ? "id" : "clerk_user_id", userId)
    .eq("isDeleted", false)
    .maybeSingle();


  if (dbError || !dbUser) {
    logger.error(requestId, "User lookup failed", dbError);
    return formatErrorResponse("User not found", ApiErrorCode.NOT_FOUND, requestId, 404);
  }

  if (await isProfileHiddenDueToBan(dbUser.id)) {
    return formatErrorResponse("User not found", ApiErrorCode.NOT_FOUND, requestId, 404);
  }

  const targetInternalUserId = dbUser.id;
  const dbProfile = dbUser.profiles || {};

  // 2. Map via profileMapper
  const userDto = profileMapper.fromDb(dbUser, dbProfile);

  // 3. Fetch auxiliary content (posts, follows)
  const [
    { data: postsData }, 
    { count: followersCount }, 
    { count: followingCount }, 
    { data: rawLikesData }
  ] = await Promise.all([
    supabase.from("user_posts").select("id, image_url").eq("user_id", targetInternalUserId).order("created_at", { ascending: false }),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", targetInternalUserId),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", targetInternalUserId),
    supabase.from("user_posts").select("likes").eq("user_id", targetInternalUserId)
  ]);

  const posts = Array.isArray(postsData) ? postsData : [];
  const likesSum = (rawLikesData || []).reduce((acc: number, post: any) => acc + (post.likes || 0), 0);


  // 4. Check if current user is following this user
  let isFollowing = false;
  let isFollowingMe = false;
  let isOwnProfile = false;

  try {
    const authResult = await resolveUser(req, { mode: 'optional' });
    if (authResult.ok && authResult.user) {
      const currentUserId = authResult.user.userId;
      isOwnProfile = currentUserId === targetInternalUserId;
      if (!isOwnProfile) {
        const { data: followData } = await supabase
          .from("user_follows")
          .select("id")
          .eq("follower_id", currentUserId)
          .eq("following_id", targetInternalUserId)
          .maybeSingle();
        isFollowing = !!followData;

        // Check if target user follows current user
        const { data: followMeData } = await supabase
          .from("user_follows")
          .select("id")
          .eq("follower_id", targetInternalUserId)
          .eq("following_id", currentUserId)
          .maybeSingle();
        isFollowingMe = !!followMeData;
      }
    }
  } catch (error) {
    logger.error(requestId, "Error checking follow status", error);
  }

  // 5. Map to Public Profile Contract
  const rawProfile = {
    ...userDto,
    name: userDto.displayName,
    age: userDto.age ? String(userDto.age) : "",
    followers: String(followersCount ?? 0),
    following: String(followingCount ?? 0),
    likes: String(likesSum),
    coverImage: "", 
    profileImage: userDto.avatar,
    posts,
    isFollowing,
    isFollowingMe,
    isOwnProfile,
    userId: targetInternalUserId,
  };


  try {
    const parsed = PublicProfileSchema.parse(rawProfile);
    return formatStandardResponse(
      parsed,
      { contractState: 'clean', degraded: false },
      { requestId, latencyMs: Date.now() - start }
    );
  } catch (err) {
    logger.error(requestId, "Profile Contract Failure", err);
    return formatErrorResponse("Profile contract violation", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}
