import redis, { ensureRedisConnection } from "./redis";
import { Coordinates } from "@kovari/types";
import { searchLocationDirect as searchLocation } from "@kovari/utils";

export { getLocationDetailsDirect } from "@kovari/utils";
export type { Coordinates, GeoapifyResult } from "@kovari/types";

// Fallback coordinates for common Indian destinations
const FALLBACK_COORDINATES: Record<string, Coordinates> = {
  goa: { lat: 15.2993, lon: 74.124 },
  "goa, india": { lat: 15.2993, lon: 74.124 },
  "goa, goa": { lat: 15.2993, lon: 74.124 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  "mumbai, india": { lat: 19.076, lon: 72.8777 },
  "mumbai, maharashtra": { lat: 19.076, lon: 72.8777 },
  "mumbai, maharashtra, india": { lat: 19.076, lon: 72.8777 },
  delhi: { lat: 28.7041, lon: 77.1025 },
  "delhi, india": { lat: 28.7041, lon: 77.1025 },
  "delhi, delhi": { lat: 28.7041, lon: 77.1025 },
  "new delhi": { lat: 28.6139, lon: 77.209 },
  "new delhi, india": { lat: 28.6139, lon: 77.209 },
  "new delhi, delhi": { lat: 28.6139, lon: 77.209 },
  manali: { lat: 32.2432, lon: 77.1892 },
  "manali, india": { lat: 32.2432, lon: 77.1892 },
  rishikesh: { lat: 30.0869, lon: 78.2676 },
  "rishikesh, india": { lat: 30.0869, lon: 78.2676 },
  bangalore: { lat: 12.9716, lon: 77.5946 },
  "bangalore, india": { lat: 12.9716, lon: 77.5946 },
  bengaluru: { lat: 12.9716, lon: 77.5946 },
  "bengaluru, india": { lat: 12.9716, lon: 77.5946 },
  hyderabad: { lat: 17.385, lon: 78.4867 },
  "hyderabad, india": { lat: 17.385, lon: 78.4867 },
  chennai: { lat: 13.0827, lon: 80.2707 },
  "chennai, india": { lat: 13.0827, lon: 80.2707 },
  kolkata: { lat: 22.5726, lon: 88.3639 },
  "kolkata, india": { lat: 22.5726, lon: 88.3639 },
  pune: { lat: 18.5204, lon: 73.8567 },
  "pune, india": { lat: 18.5204, lon: 73.8567 },
  jaipur: { lat: 26.9124, lon: 75.7873 },
  "jaipur, india": { lat: 26.9124, lon: 75.7873 },
  udaipur: { lat: 24.5854, lon: 73.7125 },
  "udaipur, india": { lat: 24.5854, lon: 73.7125 },
  kerala: { lat: 10.1632, lon: 76.6413 },
  "kerala, india": { lat: 10.1632, lon: 76.6413 },
  kashmir: { lat: 34.0837, lon: 74.7973 },
  "kashmir, india": { lat: 34.0837, lon: 74.7973 },
  leh: { lat: 34.1526, lon: 77.5771 },
  "leh, india": { lat: 34.1526, lon: 77.5771 },
  shimla: { lat: 31.1048, lon: 77.1734 },
  "shimla, india": { lat: 31.1048, lon: 77.1734 },
  darjeeling: { lat: 27.036, lon: 88.2627 },
  "darjeeling, india": { lat: 27.036, lon: 88.2627 },

  // NEW — ICP destinations missing from fallback

  // Himachal Pradesh
  "spiti valley": { lat: 32.2461, lon: 78.0338 },
  spiti: { lat: 32.2461, lon: 78.0338 },
  kasol: { lat: 32.0094, lon: 77.3164 },
  chopta: { lat: 30.5053, lon: 79.2173 },
  kheerganga: { lat: 32.0702, lon: 77.3572 },
  tirthan: { lat: 31.6341, lon: 77.3487 },
  "tirthan valley": { lat: 31.6341, lon: 77.3487 },
  mcleod: { lat: 32.2426, lon: 76.3234 },
  "mcleod ganj": { lat: 32.2426, lon: 76.3234 },
  dharamshala: { lat: 32.219, lon: 76.3234 },
  bir: { lat: 32.0443, lon: 76.7206 },
  "bir billing": { lat: 32.0443, lon: 76.7206 },
  chitkul: { lat: 31.3521, lon: 78.4411 },
  sangla: { lat: 31.4175, lon: 78.2382 },
  kalpa: { lat: 31.5387, lon: 78.2592 },
  kinnaur: { lat: 31.5706, lon: 78.3598 },
  kufri: { lat: 31.0986, lon: 77.2678 },
  kullu: { lat: 31.9579, lon: 77.1095 },

  // Uttarakhand
  kedarnath: { lat: 30.7352, lon: 79.0669 },
  badrinath: { lat: 30.7433, lon: 79.4938 },
  auli: { lat: 30.5194, lon: 79.562 },
  munsiyari: { lat: 30.0637, lon: 80.2379 },
  lansdowne: { lat: 29.8382, lon: 78.6866 },
  chakrata: { lat: 30.6893, lon: 77.8698 },
  binsar: { lat: 29.7167, lon: 79.7667 },
  nainital: { lat: 29.3803, lon: 79.4636 },
  mussoorie: { lat: 30.4598, lon: 78.0644 },
  haridwar: { lat: 29.9457, lon: 78.1642 },
  dehradun: { lat: 30.3165, lon: 78.0322 },

  // Rajasthan
  jaisalmer: { lat: 26.9157, lon: 70.9083 },
  pushkar: { lat: 26.4899, lon: 74.5511 },
  jodhpur: { lat: 26.2389, lon: 73.0243 },
  bikaner: { lat: 28.0229, lon: 73.3119 },
  bundi: { lat: 25.4409, lon: 75.633 },
  chittorgarh: { lat: 24.8887, lon: 74.6269 },
  mount: { lat: 24.5926, lon: 72.7156 },
  "mount abu": { lat: 24.5926, lon: 72.7156 },

  // Karnataka
  coorg: { lat: 12.3375, lon: 75.8069 },
  kodagu: { lat: 12.3375, lon: 75.8069 },
  hampi: { lat: 15.335, lon: 76.46 },
  chikmagalur: { lat: 13.3161, lon: 75.772 },
  sakleshpur: { lat: 12.944, lon: 75.7877 },
  kabini: { lat: 11.9373, lon: 76.352 },
  dandeli: { lat: 15.2667, lon: 74.6167 },

  // Northeast India
  "ziro valley": { lat: 27.544, lon: 93.8313 },
  ziro: { lat: 27.544, lon: 93.8313 },
  majuli: { lat: 26.9535, lon: 94.1666 },
  "majuli island": { lat: 26.9535, lon: 94.1666 },
  shillong: { lat: 25.5788, lon: 91.8933 },
  cherrapunji: { lat: 25.2804, lon: 91.7262 },
  dzukou: { lat: 25.522, lon: 94.092 },
  "dzukou valley": { lat: 25.522, lon: 94.092 },
  tawang: { lat: 27.5859, lon: 91.8598 },
  gangtok: { lat: 27.3389, lon: 88.6065 },
  yuksom: { lat: 27.4112, lon: 88.2389 },
  pelling: { lat: 27.359, lon: 88.1068 },

  // Goa specific
  "north goa": { lat: 15.5136, lon: 73.8324 },
  "south goa": { lat: 15.1726, lon: 74.0493 },
  vagator: { lat: 15.6022, lon: 73.7367 },
  arambol: { lat: 15.685, lon: 73.7063 },
  palolem: { lat: 14.9993, lon: 74.0234 },

  // Kerala
  munnar: { lat: 10.0889, lon: 77.0595 },
  alleppey: { lat: 9.4981, lon: 76.3388 },
  alappuzha: { lat: 9.4981, lon: 76.3388 },
  varkala: { lat: 8.7332, lon: 76.7163 },
  wayanad: { lat: 11.6854, lon: 76.1320 },
  thekkady: { lat: 9.5974, lon: 77.1532 },
  kovalam: { lat: 8.3988, lon: 76.9782 },
  kannur: { lat: 11.8745, lon: 75.3704 },

  // Andaman & Lakshadweep
  andaman: { lat: 11.7401, lon: 92.6586 },
  "port blair": { lat: 11.6234, lon: 92.7265 },
  havelock: { lat: 12.016, lon: 92.9899 },
  "havelock island": { lat: 12.016, lon: 92.9899 },
  neil: { lat: 11.8345, lon: 93.0483 },
  "neil island": { lat: 11.8345, lon: 93.0483 },
  lakshadweep: { lat: 10.5667, lon: 72.6417 },
  agatti: { lat: 10.849, lon: 72.1957 },

  // Popular international — Indian traveler destinations
  bali: { lat: -8.3405, lon: 115.092 },
  "bali, indonesia": { lat: -8.3405, lon: 115.092 },
  ubud: { lat: -8.5069, lon: 115.2625 },
  canggu: { lat: -8.6478, lon: 115.1385 },
  seminyak: { lat: -8.6914, lon: 115.1673 },
  bangkok: { lat: 13.7563, lon: 100.5018 },
  phuket: { lat: 7.8804, lon: 98.3923 },
  "chiang mai": { lat: 18.7883, lon: 98.9853 },
  "koh samui": { lat: 9.512, lon: 100.0136 },
  hanoi: { lat: 21.0285, lon: 105.8542 },
  "ho chi minh": { lat: 10.8231, lon: 106.6297 },
  "da nang": { lat: 16.0544, lon: 108.2022 },
  hoi: { lat: 15.8801, lon: 108.338 },
  "hoi an": { lat: 15.8801, lon: 108.338 },
  kathmandu: { lat: 27.7172, lon: 85.324 },
  pokhara: { lat: 28.2096, lon: 83.9856 },
  dubai: { lat: 25.2048, lon: 55.2708 },
  singapore: { lat: 1.3521, lon: 103.8198 },
  "kuala lumpur": { lat: 3.1390, lon: 101.6869 },
  colombo: { lat: 6.9271, lon: 79.8612 },
  "sri lanka": { lat: 7.8731, lon: 80.7718 },
  ella: { lat: 6.8667, lon: 81.0464 },
};

/**
 * Tries multiple location name variations to find coordinates
 */
const tryGeocodeVariations = async (
  locationName: string,
  redisClient: any
): Promise<Coordinates | null> => {
  const variations = [
    locationName,
    locationName.replace(/,?\s*india$/i, "").trim(),
    locationName + (locationName.toLowerCase().includes("india") ? "" : ", India"),
    locationName
      .replace(/,?\s*india$/i, ", Goa, India")
      .replace(/goa,\s*goa/i, "Goa"),
  ];

  const uniqueVariations = [
    ...new Set(variations.map((v) => v.toLowerCase().trim())),
  ];

  for (const variation of uniqueVariations) {
    if (FALLBACK_COORDINATES[variation]) {
      return FALLBACK_COORDINATES[variation];
    }

    try {
      const results = await searchLocation(variation);
      if (results && results.length > 0) {
        return { lat: results[0].lat, lon: results[0].lon };
      }
    } catch (error) {
      continue;
    }
  }

  return null;
};

/**
 * Converts a location name into coordinates using Geoapify, with Redis caching.
 */
export const getCoordinatesForLocation = async (
  locationName: string
): Promise<Coordinates | null> => {
  if (!locationName || typeof locationName !== "string") {
    return null;
  }

  const sanitizedLocation = locationName.trim();
  if (!sanitizedLocation) return null;

  const cacheKey = `geo:${sanitizedLocation
    .toLowerCase()
    .replace(/\s+/g, "_")}`;

  try {
    const redisClient = await ensureRedisConnection();

    // 1. Check cache
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      return JSON.parse(cachedResult);
    }

    // 2. Try variations (includes fallback check and API call)
    const coords = await tryGeocodeVariations(sanitizedLocation, redisClient);

    if (coords) {
      await redisClient.setEx(cacheKey, 2592000, JSON.stringify(coords));
      return coords;
    }

    return null;
  } catch (error) {
    console.error(`Geocoding error for "${sanitizedLocation}":`, error);
    return FALLBACK_COORDINATES[sanitizedLocation.toLowerCase()] || null;
  }
};

