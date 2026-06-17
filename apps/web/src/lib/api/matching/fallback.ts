import { createAdminSupabaseClient, redis, ensureRedisConnection } from "@kovari/api";
import { logger } from "@/lib/api/logger";
import { profileMapper } from "@/lib/mappers/profileMapper";

function getInterestWeight(interest: string): number {
  const clean = interest.toLowerCase().trim();
  switch (clean) {
    // Outdoor Adventure (Weight: 1.5)
    case "himalayan treks":
    case "camping & stargazing":
    case "river rafting":
    case "skiing & snow":
    case "wildlife & safaris":
    case "beach bumming":
    case "scuba & snorkeling":
    case "island hopping":
      return 1.5;
    // Travel Style (Weight: 1.2)
    case "solo backpacking":
    case "weekend getaways":
    case "long-term travel":
    case "workations":
    case "road trips":
    case "train journeys":
      return 1.2;
    // Food & Social (Weight: 0.8)
    case "street food crawls":
    case "local markets":
    case "chai & conversations":
    case "nightlife & clubs":
      return 0.8;
    // Default / Culture & Art / Content (Weight: 1.0)
    default:
      return 1.0;
  }
}

function calculateCompatibility(p1: any, p2: any): number {
  let score = 0;
  let totalWeight = 0;

  // 1. Interests (Weight: 50%)
  const interests1 = Array.isArray(p1.interests) ? p1.interests : [];
  const interests2 = Array.isArray(p2.interests) ? p2.interests : [];
  if (interests1.length > 0 && interests2.length > 0) {
    const set1 = new Set<string>(interests1.map((i: any) => String(i).toLowerCase().trim()).filter(Boolean));
    const set2 = new Set<string>(interests2.map((i: any) => String(i).toLowerCase().trim()).filter(Boolean));
    
    let intersectionWeight = 0;
    let unionWeight = 0;
    
    set1.forEach((item: string) => {
      if (set2.has(item)) {
        intersectionWeight += getInterestWeight(item);
      }
    });
    
    if (intersectionWeight > 0) {
      set1.forEach((item: string) => { unionWeight += getInterestWeight(item); });
      set2.forEach((item: string) => {
        if (!set1.has(item)) {
          unionWeight += getInterestWeight(item);
        }
      });
      
      const jaccard = unionWeight > 0 ? intersectionWeight / unionWeight : 0;
      score += jaccard * 0.50;
    } else {
      score += 0.1 * 0.50;
    }
    totalWeight += 0.50;
  } else {
    score += 0.3 * 0.50;
    totalWeight += 0.50;
  }

  // 2. Languages (Weight: 20%)
  const langs1 = Array.isArray(p1.languages) ? p1.languages : [];
  const langs2 = Array.isArray(p2.languages) ? p2.languages : [];
  if (langs1.length > 0 && langs2.length > 0) {
    const intersection = langs1.filter((l: string) => langs2.includes(l)).length;
    const union = new Set([...langs1, ...langs2]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    score += jaccard * 0.20;
    totalWeight += 0.20;
  } else {
    score += 0.5 * 0.20;
    totalWeight += 0.20;
  }

  // 3. Personality Type (Weight: 15%)
  if (p1.personality && p2.personality) {
    const isMatch = p1.personality.toLowerCase() === p2.personality.toLowerCase() ? 1.0 : 0.2;
    score += isMatch * 0.15;
    totalWeight += 0.15;
  } else {
    score += 0.5 * 0.15;
    totalWeight += 0.15;
  }

  // 4. Lifestyle - Smoking & Drinking (Weight: 15%)
  let lifestyleScore = 0;
  if (p1.smoking && p2.smoking) {
    lifestyleScore += p1.smoking.toLowerCase() === p2.smoking.toLowerCase() ? 0.5 : 0.1;
  } else {
    lifestyleScore += 0.25;
  }
  if (p1.drinking && p2.drinking) {
    lifestyleScore += p1.drinking.toLowerCase() === p2.drinking.toLowerCase() ? 0.5 : 0.1;
  } else {
    lifestyleScore += 0.25;
  }
  score += lifestyleScore * 0.15;
  totalWeight += 0.15;

  const rawScore = totalWeight > 0 ? score / totalWeight : 0.5;
  // Normalize to 40% - 98% range
  const normalized = 0.4 + rawScore * 0.55;
  return Math.min(0.98, Math.max(0.40, normalized));
}

/**
 * Perform legacy Supabase-based matching as a fallback for solo travelers.
 */
export async function performSoloDbMatchingFallback(
  currentUserId: string,
  filters: any,
  limit: number = 30
) {
  const supabase = createAdminSupabaseClient();
  
  // Fetch current user details to calculate real similarity
  const { data: currentUserProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", currentUserId)
    .single();

  const { data: currentUserRow } = await supabase
    .from("users")
    .select("*")
    .eq("id", currentUserId)
    .single();

  const currentUserDto = (currentUserRow && currentUserProfile)
    ? profileMapper.fromDb(currentUserRow, currentUserProfile)
    : null;

  // 1. Fetch profiles (excluding self) with full user JOIN
  let query = supabase
    .from("profiles")
    .select(`
      *,
      users!inner (
        id,
        email,
        name,
        clerk_user_id,
        isDeleted
      )
    ` as any)
    .eq("users.isDeleted", false)
    .neq("user_id", currentUserId)
    .not("name", "ilike", "%Audit%") // Exclude audit users
    .not("username", "ilike", "%seed_%") // Exclude seed users
    .not("created_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Apply basic filters
  if (filters.gender && filters.gender !== "Any") {
    query = query.eq("gender", filters.gender);
  }
  if (filters.ageMin) {
    query = query.gte("age", filters.ageMin);
  }
  if (filters.ageMax) {
    query = query.lte("age", filters.ageMax);
  }

  const { data: dbRows, error } = await query;
  if (error || !dbRows) return [];

  const rows = dbRows as any;

  // Fetch Redis travel sessions for these matched users to get their actual budgets/dates
  const sessionsMap = new Map<string, any>();
  try {
    const redisClient = await ensureRedisConnection();
    if (redisClient && rows.length > 0) {
      const sessionKeys = rows.map((p: any) => `session:${p.users?.clerk_user_id || p.user_id}`);
      const sessionStrings = await redisClient.mGet(sessionKeys);
      rows.forEach((p: any, idx: number) => {
        const sStr = sessionStrings[idx];
        if (sStr) {
          try {
            sessionsMap.set(p.user_id, JSON.parse(sStr));
          } catch (e) {
            logger.error("FALLBACK-REDIS", `Error parsing session from Redis for ${p.user_id}`, e);
          }
        }
      });
    }
  } catch (redisErr) {
    logger.error("FALLBACK-REDIS-CONN", "Redis connection or mGet failed in solo matching fallback", redisErr);
  }

  // 3. Transform via profileMapper to standardized MatchDTO
  const mappedResults = rows.map((p: any) => {
    const userDto = profileMapper.fromDb(p.users, p);
    let score = currentUserDto ? calculateCompatibility(currentUserDto, userDto) : 0.75;
    const session = sessionsMap.get(userDto.id);
    const sessionDest = session?.destination?.name;

    // Boost if their travel intentions overlap with search destination
    let hasIntentionOverlap = false;
    if (filters.destination && filters.destination !== "Any" && userDto.travel_intentions && userDto.travel_intentions.length > 0) {
      const destLower = filters.destination.toLowerCase();
      hasIntentionOverlap = userDto.travel_intentions.some((intent: any) =>
        intent.destination?.toLowerCase().includes(destLower) ||
        destLower.includes(intent.destination?.toLowerCase() || "___")
      );
      if (hasIntentionOverlap) score += 0.5; // significant overlap boost
    }

    // Filter out users who do not match the destination (via active session or travel intentions)
    if (filters.destination && filters.destination !== "Any" && filters.destination !== "Global") {
      const sessionDestLower = sessionDest?.toLowerCase();
      const filterDestLower = filters.destination.toLowerCase();
      const hasSessionOverlap = sessionDestLower && (
        sessionDestLower.includes(filterDestLower) || filterDestLower.includes(sessionDestLower)
      );

      if (!hasSessionOverlap && !hasIntentionOverlap) {
        return null;
      }
    }

    score = Math.min(0.98, score);

    return {
      id: userDto.id,
      name: userDto.displayName,
      destination: session?.destination?.name || filters.destination || userDto.location || 'India',
      budget: session?.budget !== undefined && session?.budget !== null ? session.budget.toString() : (filters.budget || 0).toString(),
      start_date: session?.startDate || filters.startDate || new Date().toISOString(),
      end_date: session?.endDate || filters.endDate || new Date().toISOString(),
      compatibility_score: score,
      budget_difference: 0,
      is_solo_match: true,

      // 🛡️ TOTAL FLATTENING for backward compatibility
      userId: userDto.id,
      age: userDto.age,
      gender: userDto.gender,
      personality: userDto.personality,
      nationality: userDto.nationality,
      profession: userDto.profession,
      interests: userDto.interests,
      languages: userDto.languages,
      locationDisplay: userDto.location || filters.destination || 'India',
      bio: userDto.bio,
      travel_intentions: userDto.travel_intentions || [],

      user: {
        userId: userDto.id,
        name: userDto.displayName,
        age: userDto.age,
        gender: userDto.gender,
        personality: userDto.personality,
        bio: userDto.bio,
        avatar: userDto.avatar,
        locationDisplay: userDto.location || filters.destination || 'India',
        interests: userDto.interests,
        languages: userDto.languages,
        nationality: userDto.nationality,
        religion: userDto.religion,
        profession: userDto.profession,
        smoking: userDto.smoking,
        drinking: userDto.drinking,
        foodPreference: userDto.foodPreference,
        travel_intentions: userDto.travel_intentions || [],
      }
    };
  });

  const validMappedResults = mappedResults.filter(Boolean);
  const filteredResults = validMappedResults.filter((res: any) => {
    // Hard filters
    if (filters.smoking && filters.smoking !== "No" && filters.smoking !== "Any" && res.user?.smoking !== filters.smoking) return false;
    if (filters.drinking && filters.drinking !== "No" && filters.drinking !== "Any" && res.user?.drinking !== filters.drinking) return false;
    if (filters.personality && filters.personality !== "Any" && res.user?.personality !== filters.personality) return false;
    if (filters.nationality && filters.nationality !== "Any" && res.user?.nationality !== filters.nationality) return false;
    
    if (filters.languages && filters.languages.length > 0) {
      const targetLangs = Array.isArray(filters.languages) ? filters.languages : filters.languages.split(",");
      const userLangs = res.user?.languages || [];
      if (!targetLangs.some((l: string) => userLangs.includes(l))) return false;
    }

    if (filters.interests && filters.interests.length > 0) {
      const targetInterests = Array.isArray(filters.interests) ? filters.interests : filters.interests.split(",");
      const userInterests = res.user?.interests || [];
      if (!targetInterests.some((i: string) => userInterests.includes(i))) return false;
    }

    if (filters.budgetRange) {
      const [min, max] = filters.budgetRange.split("-").map(Number);
      const userBudget = Number(res.budget) || 0;
      if (userBudget < min || userBudget > max) return false;
    }

    return true;
  });

  // If hard filters result in very few matches, fallback to ignoring them
  const finalResults = filteredResults.length >= 3 ? filteredResults : validMappedResults;

  return finalResults.sort((a: any, b: any) => 
    (b.compatibility_score || 0) - (a.compatibility_score || 0)
  );
}


/**
 * Perform legacy Supabase-based matching as a fallback for groups.
 */
export async function performGroupDbMatchingFallback(
  currentUserId: string,
  filters: any,
  limit: number = 30
) {
  const supabase = createAdminSupabaseClient();

  // Fetch current user's travel intentions for scoring
  const { data: currentUserProfile } = await supabase
    .from("profiles")
    .select("travel_intentions")
    .eq("user_id", currentUserId)
    .single();

  const userIntentions: any[] = Array.isArray(currentUserProfile?.travel_intentions)
    ? currentUserProfile.travel_intentions
    : [];

  let query = supabase
    .from("groups")
    .select(`
      id,
      name,
      is_public,
      destination,
      start_date,
      end_date,
      creator_id,
      created_at,
      cover_image,
      members_count,
      description,
      status,
      budget,
      ai_overview,
      non_smokers,
      non_drinkers,
      destination_lat,
      destination_lon
    ` as any)
    .in("status", ["active", "pending"])
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Apply Search Logic (Web Parity: Extract city from formatted string)
  if (filters && filters.destination && filters.destination !== "Any") {
    const normalizedDest = filters.destination.split(",")[0].trim();
    
    // If we have coordinates, prioritize precise spatial matching
    if (filters.lat && filters.lon) {
      const epsilon = 0.5; // Roughly 50km
      query = query
        .gte("destination_lat", filters.lat - epsilon)
        .lte("destination_lat", filters.lat + epsilon)
        .gte("destination_lon", filters.lon - epsilon)
        .lte("destination_lon", filters.lon + epsilon);
    } else {
      // Fallback to name-based match
      query = query.ilike("destination", `%${normalizedDest}%`);
    }
  }

  const { data: groups, error } = await query;
  
  if (error) {
    logger.error("GROUP-FALLBACK", "DB Match Query Failed", error);
    return [];
  }

  if (!groups) return [];

  const results = groups.map((g: any) => {
    let score = 0.5;

    // Boost groups whose destination matches user's travel intentions
    if (userIntentions.length > 0 && g.destination) {
      const groupDestLower = g.destination.toLowerCase();
      
      const hasOverlap = userIntentions.some((intent: any) =>
        intent.destination?.toLowerCase().includes(groupDestLower) ||
        groupDestLower.includes(intent.destination?.toLowerCase() || "___")
      );
      if (hasOverlap) score += 0.5; // combined overlap boost
    }

    score = Math.min(0.98, score);

    return {
      id: g.id,
      name: g.name,
      description: g.description,
      destination: g.destination,
      membersCount: g.members_count || 1, // Default to 1 (creator)
      score,
      startDate: g.start_date,
      endDate: g.end_date,
      creatorId: g.creator_id,
      status: g.status,
      budget: g.budget,
      ai_overview: g.ai_overview,
      coverImage: g.cover_image,
      is_public: g.is_public
    };
  });

  const filteredResults = results.filter((res: any) => {
    if (filters.budgetRange) {
      const [min, max] = filters.budgetRange.split("-").map(Number);
      const groupBudget = Number(res.budget) || 0;
      if (groupBudget < min || groupBudget > max) return false;
    }
    return true;
  });

  // If hard filters result in very few matches, fallback to ignoring them
  const finalResults = filteredResults.length >= 3 ? filteredResults : results;

  return finalResults.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
}
