import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { createAdminSupabaseClient, createRouteHandlerSupabaseClientWithServiceRole, sendRegistrationVerificationEmail } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { logger } from "@/lib/api/logger";
import { profileMapper } from "@/lib/mappers/profileMapper";
import crypto from "crypto";

const updateProfileSchema = z.object({
  field: z.string(),
  value: z.any(),
});

export async function PATCH(req: Request) {
  const user = await getAuthenticatedUser(req as any);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const result = updateProfileSchema.safeParse(body);

  if (!result.success) {
    return new Response(JSON.stringify({ error: "Invalid request data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { field, value } = result.data;
  const supabase = createAdminSupabaseClient();

  try {
    // 1. Handle Interests
    if (field === "interests") {
      const { error: interestsUpdateError } = await supabase
        .from("profiles")
        .update({ interests: value })
        .eq("user_id", user.id);

      if (interestsUpdateError) {
        logger.error("PROFILE-UPDATE", "Error updating profile interests", interestsUpdateError);
        return new Response(JSON.stringify({ error: "Failed to update interests" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Interests updated successfully", field, value }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Handle Email (Verification Flow)
    if (field === "email") {
      const emailValue = typeof value === "string" ? value.trim() : String(value ?? "");
      if (!emailValue) {
        return new Response(JSON.stringify({ error: "Email value is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check if email already in use
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .ilike("email", emailValue)
        .maybeSingle();

      if (existingUser && existingUser.id !== user.id) {
        return new Response(JSON.stringify({ error: "Email already in use" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      // IF Clerk User: Direct Sync (already verified on frontend via Clerk)
      if (user.clerkUserId) {
        // Update users table
        const { error: userUpdateError } = await supabase
          .from("users")
          .update({ email: emailValue })
          .eq("id", user.id);

        if (userUpdateError) {
          console.error("Error updating user email (Clerk sync):", userUpdateError);
          return new Response(JSON.stringify({ error: "Failed to sync user email" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Update profiles table
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ email: emailValue })
          .eq("user_id", user.id);

        if (profileUpdateError) {
          console.error("Error updating profile email (Clerk sync):", profileUpdateError);
          return new Response(JSON.stringify({ error: "Failed to sync profile email" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ message: "Email synced successfully", field, value }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Generate OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      const adminSupabase = createRouteHandlerSupabaseClientWithServiceRole();

      // Upsert to verification_codes
      const { error: otpError } = await adminSupabase
        .from("verification_codes")
        .upsert({
          email: emailValue,
          code: otp,
          expires_at: expiresAt.toISOString(),
          payload: { pendingEmail: emailValue, userId: user.id },
          is_sending: true,
          last_sent_at: new Date().toISOString(),
        }, { onConflict: 'email' });

      if (otpError) {
        console.error("Failed to store OTP for email change:", otpError);
        return new Response(JSON.stringify({ error: "Failed to initialize verification" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Dispatch Email
      try {
        await sendRegistrationVerificationEmail({ to: emailValue, code: otp });
      } catch (emailError) {
        console.error("Email dispatch failed:", emailError);
        await adminSupabase.from("verification_codes").update({ is_sending: false }).eq("email", emailValue);
        return new Response(JSON.stringify({ error: "Verification email service unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      await adminSupabase.from("verification_codes").update({ is_sending: false }).eq("email", emailValue);

      return new Response(JSON.stringify({
        verificationRequired: true,
        message: "A verification code has been sent to your new email."
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Security: Whitelist Allowed Fields
    const safeFields = [
      "username", "bio", "avatar", "profession", "interests", "languages", 
      "gender", "age", "nationality", "location", "location_details", 
      "religion", "smoking", "drinking", "personality", "foodPreference",
      "name", "email", "birthday", "travel_intentions"
    ];

    if (!safeFields.includes(field)) {
      return new Response(JSON.stringify({ error: "Update rejected: Unauthorized field" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (field === "avatar" && (!value || String(value).trim() === "")) {
      return new Response(JSON.stringify({ error: "Profile photo is mandatory and cannot be removed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5. Atomic Update via profileMapper (users + profiles)
    // Even if identity (name/email) sync is special, we still use mapper to identify targets
    const { userUpdates, profileUpdates } = profileMapper.toDbUpdate({ [field]: value });

    // Username unique check
    if (field === "username" && typeof value === "string") {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("username", value)
        .not("user_id", "eq", user.id)
        .maybeSingle();

      if (existingProfile) {
        return new Response(JSON.stringify({ error: "Username is already taken" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Execute User Updates if any (e.g. name, email - though email usually handled by verification flow)
    if (Object.keys(userUpdates).length > 0) {
      const { error: userUpdateError } = await supabase
        .from("users")
        .update(userUpdates)
        .eq("id", user.id);
      
      if (userUpdateError) {
        logger.error("USER-UPDATE", "Error updating identity data", userUpdateError);
        // We continue anyway to try and update profile, or should we abort?
        // Identity is critical, so we abort.
        return new Response(JSON.stringify({ error: "Failed to update identity data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Execute Profile Updates if any (e.g. bio, avatar, job)
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", user.id);

      if (profileUpdateError) {
        logger.error("PROFILE-UPDATE", "Error updating display data", profileUpdateError);
        return new Response(JSON.stringify({ error: "Failed to update profile data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Sync username to Bloom Filter on update
    if (field === "username" && typeof value === "string") {
      try {
        const { addToFilter } = await import("@/lib/bloomFilter");
        await addToFilter(value);
      } catch (bloomError) {
        console.error("[BloomFilter] Failed to add username on profile update:", bloomError);
      }
    }


    // 🔥 Hardening: Invalidate matching cache on profile update
    try {
      const { invalidateMatchingCache } = await import("@/lib/api/matching/cache");
      await invalidateMatchingCache(user.id);
    } catch (err: any) {
      logger.error("CACHE-INVALIDATE", "Failed to invalidate matching cache", err);
    }

    // Sync to Clerk (WEB ONLY)
    if (user.clerkUserId) {
      try {
        const client = await clerkClient();
        if (field === "username") {
          await client.users.updateUser(user.clerkUserId, { username: value });
        }
        // CRITICAL: We NO LONGER sync 'name' to Clerk here as users.name is identity-only 
        // and managed separately. profiles.name is for display only.
      } catch (err) {
        console.error("Error updating Clerk user:", err);
      }
    }


    return new Response(JSON.stringify({ message: "Profile updated successfully", field, value }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in profile update:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


