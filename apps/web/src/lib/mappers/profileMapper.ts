import { UserProfileDTO } from "@/types/profile";
import { logger } from "@/lib/api/logger";

/**
 * 🗺️ profileMapper
 * The SINGLE source of truth for normalizing database data
 * from the 'users' and 'profiles' tables into a UserProfileDTO.
 */
export const profileMapper = {
  /**
   * 📥 fromDb
   * Safely merges and normalizes database rows.
   * Handles missing profile rows and ensures strict defaults.
   */
  fromDb(userRow: any, profileRow: any = {}): UserProfileDTO {
    // 1. Strict Type Guard
    if (!userRow || !userRow.id) {
      logger.error("MAPPER-CRITICAL", "Invalid userRow passed to profileMapper", { userId: userRow?.id });
      throw new Error("Invalid userRow in profileMapper: Core identity missing");
    }

    // Handle null/missing/array profileRow safely
    const resolvedProfile = Array.isArray(profileRow) ? (profileRow[0] || {}) : (profileRow || {});
    const p = resolvedProfile;
    const u = userRow;

    // 2. Structured Logging for Source Tracking (Debug purposes)
    logger.debug("MAPPER-FLOW", {
      userId: u.id,
      hasProfile: !!profileRow,
      emailSource: u.email ? "users" : (p.email ? "profiles" : "none"),
      nameSource: p.name ? "profiles" : (u.name ? "users" : "none")
    });

    // 3. Username Fallback Hardening
    const shortId = u.id.replace(/-/g, '').slice(0, 8);
    const fallbackUsername = `user_${shortId}`;

    // Safely parse JSON strings for travel_intentions and location_details
    let parsedTravelIntentions = p.travel_intentions;
    if (typeof parsedTravelIntentions === 'string') {
      try {
        parsedTravelIntentions = JSON.parse(parsedTravelIntentions);
      } catch {
        parsedTravelIntentions = [];
      }
    }

    let parsedLocationDetails = p.location_details;
    if (typeof parsedLocationDetails === 'string') {
      try {
        parsedLocationDetails = JSON.parse(parsedLocationDetails);
      } catch {
        parsedLocationDetails = {};
      }
    }

    // 4. Transform and Normalize
    return {
      id: u.id,
      
      // Identity Ownership
      email: u.email || p.email || "",
      displayName: p.name || u.name || "Traveler",
      username: p.username || fallbackUsername,
      
      // User-Facing Data Normalization
      avatar: p.profile_photo || p.avatar || "",
      profession: p.job || p.profession || "",
      bio: p.bio || "",
      birthday: p.birthday || "",
      
      // Demographic
      age: typeof p.age === 'number' ? p.age : 0,
      gender: p.gender || "Prefer not to say",
      nationality: p.nationality || "",
      location: p.location || "",
      location_details: parsedLocationDetails || {},
      
      // Arrays Safety (Strict validation)
      interests: Array.isArray(p.interests) ? p.interests : [],
      languages: Array.isArray(p.languages) ? p.languages : [],
      
      // Lifestyle attributes
      religion: p.religion || "",
      smoking: p.smoking || "",
      drinking: p.drinking || "",
      personality: p.personality || "",
      foodPreference: p.food_preference || p.foodPreference || "",
      
      // Verification
      verified: !!p.verified,
      is_internal: !!(u.is_internal ?? p.is_internal ?? false),
      
      travel_intentions: Array.isArray(parsedTravelIntentions) ? parsedTravelIntentions : [],
    };
  },

  /**
   * 📤 toDbUpdate
   * Safely splits a UserProfileDTO (or partial) into table-specific updates.
   * Enforces strict field ownership to prevent data drift.
   */
  toDbUpdate(dto: Partial<UserProfileDTO>): {
    userUpdates: Record<string, any>;
    profileUpdates: Record<string, any>;
  } {
    const userUpdates: Record<string, any> = {};
    const profileUpdates: Record<string, any> = {};

    // 1. Identity Ownership (users table)
    // CRITICAL: email is the ONLY identity field owned here. users.name is preserved.
    if (dto.email !== undefined) userUpdates.email = dto.email;

    // 2. User-Facing Data & Display Ownership (profiles table)
    // CRITICAL: profiles.name is the ONLY target for display name updates.
    if (dto.displayName !== undefined) profileUpdates.name = dto.displayName;
    if ((dto as any).name !== undefined) profileUpdates.name = (dto as any).name;
    
    if (dto.username !== undefined) profileUpdates.username = dto.username;
    if (dto.avatar !== undefined) profileUpdates.profile_photo = dto.avatar;
    if (dto.profession !== undefined) profileUpdates.job = dto.profession;
    if (dto.bio !== undefined) profileUpdates.bio = dto.bio;
    if (dto.birthday !== undefined) profileUpdates.birthday = dto.birthday;
    
    // Demographic
    if (dto.age !== undefined) profileUpdates.age = dto.age;
    if (dto.gender !== undefined) profileUpdates.gender = dto.gender;
    if (dto.nationality !== undefined) profileUpdates.nationality = dto.nationality;
    if (dto.location !== undefined) profileUpdates.location = dto.location;
    if (dto.location_details !== undefined) profileUpdates.location_details = dto.location_details;
    
    // Collections
    if (dto.interests !== undefined) profileUpdates.interests = dto.interests;
    if (dto.languages !== undefined) profileUpdates.languages = dto.languages;
    
    // Lifestyle
    if (dto.religion !== undefined) profileUpdates.religion = dto.religion;
    if (dto.smoking !== undefined) profileUpdates.smoking = dto.smoking;
    if (dto.drinking !== undefined) profileUpdates.drinking = dto.drinking;
    if (dto.personality !== undefined) profileUpdates.personality = dto.personality;
    if (dto.foodPreference !== undefined) profileUpdates.food_preference = dto.foodPreference;
    
    // Verification
    if (dto.verified !== undefined) profileUpdates.verified = dto.verified;

    if (dto.travel_intentions !== undefined) profileUpdates.travel_intentions = dto.travel_intentions;

    return { userUpdates, profileUpdates };
  }

};
