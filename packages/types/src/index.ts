// Location: /src/types/index.ts

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface UserProfile {
  name?: string;
  username?: string;
  profile_photo?: string;
  deleted?: boolean;
  clerk_id?: string;
}

export interface Group {
  group_id: string;
  group: {
    id: string;
    name: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
    cover_image: string | null;
    destination_image: string | null;
    members_count: number;
    is_public: boolean | null;
    status?: string;
  } | null;
  status: string;
  role: string;
}

export interface GeoapifyResult {
  place_id: string;
  formatted: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
  address_line1?: string;
  address_line2?: string;
}

export interface StaticAttributes {
  name?: string;
  age: number;
  gender: string;
  personality: string;
  location: {
    lat: number;
    lon: number;
  };
  smoking: string;
  drinking: string;
  religion: string;
  interests: string[];
  language: string;
  languages?: string[];
  nationality: string;
  profession: string;
  avatar?: string;
  bio?: string;
}

export interface SoloSession {
  userId?: string;
  destination: {
    name?: string;
    lat: number;
    lon: number;
  };
  budget: number;
  startDate: string;
  endDate: string;
  mode: string;
  interests?: string[];
  location?: Coordinates | null;
  geoSource?: string;
  static_attributes?: StaticAttributes; // Optional now - only for existing sessions
}

export * from './notifications';
export * from './socket';
export * from './migration';
export * from './outgoing';
