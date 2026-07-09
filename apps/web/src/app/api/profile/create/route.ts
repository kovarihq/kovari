import { z } from "zod";
import { createAdminSupabaseClient } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/api/requestId";
import { detectClient } from "@/lib/api/clientDetection";
import { 
  formatStandardResponse, 
  formatErrorResponse, 
  safeTransform 
} from "@/lib/api/responseHelpers";
import { profileTransformer } from "@/lib/transformers/profileTransformer";
import { ApiErrorCode, KovariClient } from "@/types/api";
import { assertNoProfanity } from "@/lib/moderation/filter";

const schema = z.object({
  name: z.string().min(2),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  age: z.coerce.number().min(13).max(100),
  gender: z.enum(["Male", "Female", "Other", "Prefer not to say"]),
  birthday: z.string().datetime(),
  bio: z.string().max(300).optional().default(""),
  profile_photo: z.string().url().optional().nullable(),
  location: z.string().min(1),
  location_details: z.any().optional().nullable(),
  languages: z.array(z.string()),
  nationality: z.string(),
  job: z.string().optional().default(""),
  religion: z.string().min(1),
  smoking: z.string().min(1),
  drinking: z.string().min(1),
  personality: z.string().min(1),
  food_preference: z.string().min(1),
  interests: z.array(z.string()).optional().default([]),
  travel_intentions: z.array(z.object({
    destination: z.string(),
    destination_details: z.any().optional(),
    rough_dates: z.string().optional(),
    budget_range: z.string().optional(),
    travel_style: z.string().optional(),
    is_confirmed: z.boolean().optional(),
  })).optional().default([]),
});

/**
 * 🚀 PARTIAL TO COMPLETE ATOMIC PROFILE CREATION
 * This endpoint is ONLY for the first-time profile creation after onboarding.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = generateRequestId();
  const { client } = detectClient(req);

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      const { userId } = await auth();
      console.warn(`[api/profile/create] Unauthorized attempt. Clerk UID: ${userId}, RequestID: ${requestId}`);
      return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);
    }

    const body = await req.json();
    const supabase = createAdminSupabaseClient();

    // Check if profile already exists
    const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", authUser.id)
        .maybeSingle();

    if (existing) {
      // Validate with partial schema for updates (allows blank/omitted fields during edits)
      const result = schema.partial().safeParse(body);
      if (!result.success) {
        return formatErrorResponse("Validation failed", ApiErrorCode.BAD_REQUEST, requestId, 400, result.error.flatten());
      }

      // SECURITY: Profanity filter on write
      try {
        if (result.data.name) assertNoProfanity(result.data.name, "Name");
        if (result.data.bio) assertNoProfanity(result.data.bio, "Bio");
      } catch (err: any) {
        return formatErrorResponse(err.message, ApiErrorCode.BAD_REQUEST, requestId, 400);
      }

      const { firstName, lastName, ...dbFields } = result.data;
      const updatePayload = {
        ...dbFields,
        ...(dbFields.travel_intentions ? { travel_intentions: dbFields.travel_intentions } : {}),
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("user_id", authUser.id);

      if (updateError) {
        console.error("Profile update failed in create fallback:", updateError);
        return formatErrorResponse("Profile update failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
      }

      // Finalize Onboarding Status for existing profile flow
      const { error: flagError } = await supabase
        .from("users")
        .update({ onboarding_completed: true })
        .eq("id", authUser.id);

      if (flagError) {
        console.error("Failed to update onboarding flag in create fallback:", flagError);
      }

      const transformRes = safeTransform(profileTransformer, {
        user_id: authUser.id,
        email: authUser.email,
        ...updatePayload,
      });

      if (!transformRes.ok) {
        return formatErrorResponse("Contract violation", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
      }
      const latencyMs = Date.now() - start;

      return formatStandardResponse(
        { profile: transformRes.data },
        {},
        { requestId, latencyMs }
      );
    }

    // Otherwise, validate with strict schema for first-time creation
    const result = schema.safeParse(body);
    if (!result.success) {
      return formatErrorResponse("Validation failed", ApiErrorCode.BAD_REQUEST, requestId, 400, result.error.flatten());
    }

    // SECURITY: Profanity filter on write
    try {
      assertNoProfanity(result.data.name, "Name");
      assertNoProfanity(result.data.bio, "Bio");
    } catch (err: any) {
      return formatErrorResponse(err.message, ApiErrorCode.BAD_REQUEST, requestId, 400);
    }

    // Strip firstName and lastName as they are NOT in the database schema
    const { firstName, lastName, ...dbFields } = result.data;
    
    const profileData = {
      user_id: authUser.id,
      email: authUser.email,
      ...dbFields,
      travel_intentions: dbFields.travel_intentions ?? [],
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("profiles").insert(profileData);
    
    if (insertError) {
      console.error("Profile insertion error:", insertError);
      return formatErrorResponse(
        `Database insertion failed: ${insertError.message} (${insertError.code})`,
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        requestId,
        500,
        { details: insertError.details, hint: insertError.hint }
      );
    }

    // Sync username to Bloom Filter
    try {
      const { addToFilter } = await import("@/lib/bloomFilter");
      await addToFilter(result.data.username);
    } catch (bloomError) {
      console.error("[BloomFilter] Failed to add username on profile creation:", bloomError);
    }

    // 🏆 Finalize Onboarding Status
    const { error: flagError } = await supabase
      .from("users")
      .update({ onboarding_completed: true })
      .eq("id", authUser.id);

    if (flagError) {
       console.error("Failed to update onboarding flag:", flagError);
    }

    // 🛡️ Post-creation Integrity Check (Fetch full joined record)
    const { data: newUserRow, error: verifyError } = await supabase
      .from("users")
      .select("*, profiles(*)")
      .eq("id", authUser.id)
      .single();

    if (verifyError || !newUserRow) {
      console.error("Post-creation verification failed:", verifyError);
      return formatErrorResponse("Post-creation integrity check failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    // 5. Transform for Response
    const transformRes = safeTransform(profileTransformer, newUserRow);
    if (!transformRes.ok) {
      return formatErrorResponse("Profile transformation failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    const latencyMs = Date.now() - start;

    return formatStandardResponse(
      { profile: transformRes.data },
      { message: "Profile created successfully" },
      { requestId, latencyMs }
    );

  } catch (err: any) {
    console.error("Atomic profile creation failure:", err);
    return formatErrorResponse("Internal system error", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}
