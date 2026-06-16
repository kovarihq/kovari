
/**
 * Geocoding Core Service (Geoapify Direct Implementation)
 * 
 * This module provides direct access to Geoapify APIs.
 * It is intended for SERVER-SIDE usage to avoid relative URL issues with fetch.
 */

export interface Coordinates {
  lat: number;
  lon: number;
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

/**
 * Searches for locations using Geoapify Autocomplete API directly.
 * SERVER-ONLY: Uses GEOAPIFY_API_KEY from environment.
 */
export const searchLocationDirect = async (
  query: string
): Promise<GeoapifyResult[]> => {
  const apiKey =
    process.env.GEOAPIFY_API_KEY ||
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;

  if (!apiKey) {
    console.error("Geoapify API key not configured");
    return [];
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.searchParams.append("text", query);
    
    // REMOVED: type=city
    url.searchParams.append("limit", "7");
    url.searchParams.append("lang", "en");
    url.searchParams.append("bias", "countrycode:in");
    url.searchParams.append("apiKey", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.error(`Geoapify API error: ${res.status}`);
      return [];
    }
    const data = await res.json();

    return (data.features || []).map((feature: any) => ({
      place_id: feature.properties.place_id,
      formatted: feature.properties.formatted,
      name: feature.properties.name,
      city:
        feature.properties.city ||
        feature.properties.town ||
        feature.properties.village ||
        feature.properties.hamlet ||
        feature.properties.suburb ||
        feature.properties.county ||
        feature.properties.state_district,
      state: feature.properties.state || feature.properties.county,
      country: feature.properties.country,
      lat: feature.properties.lat,
      lon: feature.properties.lon,
      address_line1: feature.properties.address_line1,
      address_line2: feature.properties.address_line2,
    }));
  } catch (error) {
    console.error("Direct geocoding search error:", error);
    return [];
  }
};

/**
 * Gets detailed location data for a place_id via Geoapify directly.
 * SERVER-ONLY: Uses GEOAPIFY_API_KEY from environment.
 */
export const getLocationDetailsDirect = async (placeId: string) => {
  const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.error("Geoapify API key not configured");
    return null;
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.append("id", placeId);
    url.searchParams.append("apiKey", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch location details");
    const data = await res.json();
    const feature = data.features?.[0];

    if (!feature) return null;

    const props = feature.properties;
    return {
      city: props.city || props.town || props.village || props.suburb || "",
      state: props.state || props.county || "",
      country: props.country || "",
      lat: props.lat,
      lon: props.lon,
      formatted: props.formatted,
      place_id: props.place_id,
    };
  } catch (error) {
    console.error("Direct geocoding details error:", error);
    return null;
  }
};
