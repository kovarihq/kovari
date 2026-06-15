import { z } from "zod";

/**
 * 🛡️ Go Service Solo Match Item Schema
 */
export const GoSoloMatchSchema = z.object({
  userId: z.string().default(""),
  score: z.number().default(0),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  budget: z.number().default(0),
  destination: z.string().default(""),
  budgetDifference: z.string().default(""),
  user: z.object({
    userId: z.string().default(""),
    name: z.string().default("Traveler"),
    age: z.number().default(0),
    gender: z.string().default(""),
    personality: z.string().default(""),
    bio: z.string().default(""),
    avatar: z.string().default(""),
    location: z.string().default(""),
    locationDisplay: z.string().default(""),
    smoking: z.string().default(""),
    drinking: z.string().default(""),
    interests: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
    nationality: z.string().default(""),
    religion: z.string().default(""),
    profession: z.string().default(""),
    foodPreference: z.string().default(""),
    travelIntentions: z.array(
      z.object({
        destination: z.string(),
        destination_details: z
          .object({
            city: z.string().optional().nullable(),
            country: z.string().optional().nullable(),
            lat: z.number().optional().nullable(),
            lon: z.number().optional().nullable(),
          })
          .optional()
          .nullable(),
      })
    ).optional().default([]),
    travel_intentions: z.array(
      z.object({
        destination: z.string(),
        destination_details: z
          .object({
            city: z.string().optional().nullable(),
            country: z.string().optional().nullable(),
            lat: z.number().optional().nullable(),
            lon: z.number().optional().nullable(),
          })
          .optional()
          .nullable(),
      })
    ).optional().default([]),
  }).nullish().default({}),
}).passthrough();


/**
 * 🛡️ Go Service Group Match Item Schema
 */
export const GoGroupMatchSchema = z.object({
  group: z.object({
    groupId: z.string(),
    name: z.string().default("Unknown Group"),
    destination: z.object({
      name: z.string().default(""),
      lat: z.number().default(0),
      lon: z.number().default(0),
    }).default({}),
    averageBudget: z.number().default(0),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    averageAge: z.number().default(0),
    dominantLanguages: z.array(z.string()).default([]),
    topInterests: z.array(z.string()).default([]),
    smokingPolicy: z.string().default(""),
    drinkingPolicy: z.string().default(""),
    dominantNationalities: z.array(z.string()).default([]),
    distanceKm: z.number().default(0),
    size: z.number().default(0),
  }),
  score: z.number().default(0),
  mlScore: z.number().nullish(),
  breakdown: z.record(z.string(), z.number()).default({}),
  budgetDifference: z.string().default(""),
});

/**
 * 🛡️ Go Service Wrapped Response Schemas
 */
export const GoSoloResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    matches: z.array(z.any()),
  }),
  meta: z.any().optional(),
});

export const GoGroupResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    groups: z.array(z.any()),
  }),
  meta: z.any().optional(),
});

export const GoErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    code: z.string(),
    details: z.any().nullish(),
  }),
  context: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
});

export type GoSoloMatch = z.infer<typeof GoSoloMatchSchema>;
export type GoGroupMatch = z.infer<typeof GoGroupMatchSchema>;
