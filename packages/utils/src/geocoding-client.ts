
// -----------------------------------------------------------------------------
//   File: Geocoding Client Service (Geoapify Implementation)
// -----------------------------------------------------------------------------
// Location: /lib/geocoding-client.ts
// Purpose: To abstract the client-safe logic for converting location names.

import { Coordinates, GeoapifyResult } from "./geocoding-core";

export interface LocationData {
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  formatted: string;
  display_name: string; // for compatibility
  place_id: string;
}

// In-memory cache for autocomplete queries to make them instant
const queryCache = new Map<string, GeoapifyResult[]>();

// Curated list of popular Indian trek routes and passes
const INDIA_TREK_DESTINATIONS = [
  // Mountain passes
  { name: "Hampta Pass", state: "Himachal Pradesh", lat: 32.2667, lon: 77.3167 },
  { name: "Rohtang Pass", state: "Himachal Pradesh", lat: 32.3714, lon: 77.2500 },
  { name: "Baralacha La", state: "Himachal Pradesh", lat: 32.7333, lon: 77.4333 },
  { name: "Kunzum Pass", state: "Himachal Pradesh", lat: 32.4500, lon: 77.7667 },
  { name: "Chang La", state: "Ladakh", lat: 34.0500, lon: 77.6000 },
  { name: "Khardung La", state: "Ladakh", lat: 34.2783, lon: 77.6033 },

  // Popular treks
  { name: "Kedarkantha Trek", state: "Uttarakhand", lat: 31.0314, lon: 78.2292 },
  { name: "Roopkund Trek", state: "Uttarakhand", lat: 30.2438, lon: 79.7258 },
  { name: "Valley of Flowers", state: "Uttarakhand", lat: 30.7280, lon: 79.6059 },
  { name: "Har Ki Dun", state: "Uttarakhand", lat: 31.1714, lon: 78.4175 },
  { name: "Brahmatal Trek", state: "Uttarakhand", lat: 30.1500, lon: 79.5000 },
  { name: "Kuari Pass", state: "Uttarakhand", lat: 30.5167, lon: 79.6167 },
  { name: "Sandakphu Trek", state: "West Bengal", lat: 27.1054, lon: 88.0054 },
  { name: "Goechala Trek", state: "Sikkim", lat: 27.5833, lon: 88.1167 },
  { name: "Tarsar Marsar", state: "Kashmir", lat: 34.0667, lon: 75.2833 },
  { name: "Great Lakes Kashmir", state: "Kashmir", lat: 34.2000, lon: 75.4000 },
  { name: "Kheerganga Trek", state: "Himachal Pradesh", lat: 32.0702, lon: 77.3572 },
  { name: "Triund Trek", state: "Himachal Pradesh", lat: 32.2833, lon: 76.3667 },
  { name: "Buran Ghati", state: "Himachal Pradesh", lat: 31.4667, lon: 77.7500 },
  { name: "Pin Parvati Pass", state: "Himachal Pradesh", lat: 31.9833, lon: 77.8000 },

  // Specific valleys and regions not indexed by Geoapify
  { name: "Spiti Valley", state: "Himachal Pradesh", lat: 32.2461, lon: 78.0338 },
  { name: "Dzukou Valley", state: "Nagaland", lat: 25.5220, lon: 94.0920 },
  { name: "Tirthan Valley", state: "Himachal Pradesh", lat: 31.6341, lon: 77.3487 },
  { name: "Sangla Valley", state: "Himachal Pradesh", lat: 31.4175, lon: 78.2382 },
  { name: "Parvati Valley", state: "Himachal Pradesh", lat: 31.9000, lon: 77.2000 },
];

// Convert to GeoapifyResult shape
const trekToResult = (trek: typeof INDIA_TREK_DESTINATIONS[0]): GeoapifyResult => ({
  place_id: `local_${trek.name.toLowerCase().replace(/\s+/g, "_")}`,
  formatted: `${trek.name}, ${trek.state}, India`,
  city: trek.name,
  state: trek.state,
  country: "India",
  lat: trek.lat,
  lon: trek.lon,
});

// Search local list first
const searchLocalDestinations = (query: string): GeoapifyResult[] => {
  const q = query.toLowerCase().trim();
  return INDIA_TREK_DESTINATIONS
    .filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.state.toLowerCase().includes(q)
    )
    .slice(0, 3)
    .map(trekToResult);
};

/**
 * Searches for locations using Geoapify Autocomplete API via server proxy,
 * merged with a curated local search layer for Indian trek routes/passes.
 * Safe for client-side usage.
 */
export const searchLocation = async (
  query: string,
  signal?: AbortSignal
): Promise<GeoapifyResult[]> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (queryCache.has(normalizedQuery)) {
    return queryCache.get(normalizedQuery)!;
  }

  // Check local curated list first
  const localResults = searchLocalDestinations(query);

  try {
    const res = await fetch(
      `/api/proxy/geocoding?type=autocomplete&q=${encodeURIComponent(query)}`,
      { signal, credentials: "same-origin" }
    );
    if (!res.ok) return localResults;

    const data = await res.json();
    const apiResults: GeoapifyResult[] = (data.features || []).map((feature: any) => ({
      place_id: feature.properties.place_id,
      formatted: feature.properties.formatted,
      city:
        feature.properties.city ||
        feature.properties.town ||
        feature.properties.village ||
        feature.properties.hamlet ||
        feature.properties.suburb ||
        feature.properties.county ||
        feature.properties.state_district ||
        feature.properties.name,
      state: feature.properties.state || feature.properties.county,
      country: feature.properties.country,
      lat: feature.properties.lat,
      lon: feature.properties.lon,
      address_line1: feature.properties.address_line1,
      address_line2: feature.properties.address_line2,
    }));

    // Merge: local results first, then API results
    // Deduplicate by name to avoid "Kasol" appearing twice
    const localNames = new Set(
      localResults.map((r: GeoapifyResult) => r.city?.toLowerCase())
    );
    const deduped = apiResults.filter(
      (r: GeoapifyResult) => !localNames.has(r.city?.toLowerCase())
    );

    // India first, then international
    const sorted = [...localResults, ...deduped].sort((a, b) => {
      if (a.country === "India" && b.country !== "India") return -1;
      if (a.country !== "India" && b.country === "India") return 1;
      return 0;
    });

    const final = sorted.slice(0, 7);
    queryCache.set(normalizedQuery, final);
    return final;

  } catch (error: any) {
    if (error.name === "AbortError") return localResults;
    return localResults;
  }
};

/**
 * Gets detailed location data for a place_id via server proxy.
 * Safe for client-side usage.
 */
export const getLocationDetails = async (placeId: string): Promise<LocationData | null> => {
  try {
    const res = await fetch(`/api/proxy/geocoding?type=details&placeId=${encodeURIComponent(placeId)}`);
    if (!res.ok) throw new Error("Failed to fetch location details");
    const data = await res.json();
    const feature = data.features?.[0];

    if (!feature) return null;

    const props = feature.properties;
    const city = props.city || props.town || props.village || props.suburb || "";
    const state = props.state || props.county || "";
    const country = props.country || "";
    
    return {
      city,
      state,
      country,
      lat: props.lat,
      lon: props.lon,
      formatted: props.formatted,
      display_name: props.formatted, 
      place_id: props.place_id,
    };
  } catch (error) {
    console.error("Geocoding details error:", error);
    return null;
  }
};
