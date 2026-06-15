import { Transformer } from "@/types/api";
import { profileMapper } from "../mappers/profileMapper";

export interface MatchDTO {
  id: string;
  name: string;
  destination: string;
  budget: string;
  start_date: string;
  end_date: string;
  compatibility_score: number;
  budget_difference: number;
  is_solo_match: boolean;
  
  // 🛡️ Flattened fields for legacy/picky component support
  userId: string;
  age: number;
  gender?: string;
  personality?: string;
  nationality?: string;
  profession?: string;
  interests?: string[];
  languages?: string[];
  locationDisplay?: string;
  bio?: string;
  travel_intentions?: any[];

  user?: {
    userId: string;
    name: string;
    age: number;
    gender?: string;
    personality?: string;
    bio?: string;
    avatar?: string;
    locationDisplay?: string;
    interests?: string[];
    languages?: string[];
    nationality?: string;
    religion?: string;
    profession?: string;
    smoking?: string;
    drinking?: string;
    foodPreference?: string;
    travel_intentions?: any[];
  };
}

export class MatchTransformer implements Transformer<any, MatchDTO> {
  toStandard(m: any): MatchDTO {
    if (!m || (!m.userId && !m.id)) {
      throw new Error("Invalid match data: Missing mandatory field userId");
    }

    // 1. Resolve Identity and Profile Data via Mapper
    // Handles various nested structures (m.user, m.profiles, or flat m)
    const userRow = m.user || m.users || m; 
    const profileRow = m.user || m.profiles || m;
    
    // Normalize IDs for mapper (Gateway expects .id, Go sends .userId)
    if (!userRow.id && userRow.userId) userRow.id = userRow.userId;
    if (!profileRow.id && profileRow.userId) profileRow.id = profileRow.userId;

    const userDto = profileMapper.fromDb(userRow, profileRow);

    const userId = userDto.id;

    return {
      id: userId,
      name: userDto.displayName,
      destination: m.destination || userDto.location || 'India',
      budget: (m.budget || m.Budget)?.toString() || 'Flexible',
      start_date: m.start_date || m.startDate || new Date().toISOString(),
      end_date: m.end_date || m.endDate || new Date().toISOString(),
      compatibility_score: typeof m.compatibility_score === 'number' ? m.compatibility_score : (typeof m.score === 'number' ? m.score : 0.5),
      budget_difference: m.budget_difference ?? m.budgetDifference ?? 0,
      is_solo_match: true,

      // 🛡️ TOTAL FLATTENING for backward compatibility
      userId,
      age: userDto.age,
      gender: userDto.gender,
      personality: userDto.personality,
      nationality: userDto.nationality,
      profession: userDto.profession,
      interests: userDto.interests,
      languages: userDto.languages,
      locationDisplay: userDto.location || m.destination || 'India',
      bio: userDto.bio,
      travel_intentions: (userDto.travel_intentions && userDto.travel_intentions.length > 0)
        ? userDto.travel_intentions
        : (m.travelIntentions || m.travel_intentions || (m.user?.travelIntentions || m.user?.travel_intentions) || []),

      user: {
        userId,
        name: userDto.displayName,
        age: userDto.age,
        gender: userDto.gender,
        personality: userDto.personality,
        bio: userDto.bio,
        avatar: userDto.avatar,
        locationDisplay: userDto.location || m.destination || 'India',
        interests: userDto.interests,
        languages: userDto.languages,
        nationality: userDto.nationality,
        religion: userDto.religion,
        profession: userDto.profession,
        smoking: userDto.smoking,
        drinking: userDto.drinking,
        foodPreference: userDto.foodPreference,
        travel_intentions: (userDto.travel_intentions && userDto.travel_intentions.length > 0)
          ? userDto.travel_intentions
          : (m.travelIntentions || m.travel_intentions || (m.user?.travelIntentions || m.user?.travel_intentions) || []),
      }
    };
  }
}

export const matchTransformer = new MatchTransformer();

