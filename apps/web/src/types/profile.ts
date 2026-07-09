/**
 * 🛡️ UserProfileDTO
 * Standard data contract for unified identity and profile data.
 * Enforced by profileMapper.
 */
export interface UserProfileDTO {
  id: string;
  email: string;
  displayName: string;
  username: string;
  avatar: string;
  profession: string;
  bio: string;
  birthday: string;
  
  // Lifestyle & Demographic
  age: number;
  gender: string;
  nationality: string;
  location: string;
  location_details: Record<string, any>;
  
  // Preferences
  interests: string[];
  languages: string[];
  
  // Lifestyle attributes
  religion: string;
  smoking: string;
  drinking: string;
  personality: string;
  foodPreference: string;
  
  // Verification
  verified: boolean;
  is_internal: boolean;

  travel_intentions: any[];
}
