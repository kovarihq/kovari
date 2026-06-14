import { z } from "zod";

export const profileEditSchema = z.object({
  avatar: z
    .string()
    .refine((val) => val === "" || z.string().url().safeParse(val).success, {
      message: "Avatar must be a valid URL or empty",
    })
    .optional(),
  name: z
    .string()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(50, { message: "Name must be less than 50 characters" }),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters" })
    .max(32, { message: "Username must be less than 32 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "Username can only contain letters, numbers, and underscores",
    }),
  age: z
    .number()
    .min(18, { message: "You must be at least 18 years old" })
    .max(120, { message: "Invalid age" }),
  gender: z.enum(["Male", "Female", "Other", "Prefer not to say"], {
    required_error: "Please select your gender",
  }),
  birthday: z.string().datetime({ message: "Invalid birthday" }),
  location: z.string().min(1, { message: "Location is required" }),
  location_details: z.any().optional(),
  religion: z.string().min(1, { message: "Religion is required" }),
  smoking: z.string().min(1, { message: "Smoking preference is required" }),
  drinking: z.string().min(1, { message: "Drinking preference is required" }),
  personality: z.string().min(1, { message: "Personality type is required" }),
  foodPreference: z.string().min(1, { message: "Food preference is required" }),
  nationality: z
    .string()
    .min(2, { message: "Nationality must be at least 2 characters" })
    .max(50, { message: "Nationality must be less than 50 characters" }),
  profession: z
    .string()
    .min(2, { message: "Profession must be at least 2 characters" })
    .max(50, { message: "Profession must be less than 50 characters" })
    .optional(),
  interests: z
    .array(z.string())
    .min(1, { message: "Please select at least one interest" })
    .optional(),
  languages: z
    .array(z.string())
    .min(1, { message: "Please select at least one language" })
    .optional(),
  bio: z
    .string()
    .max(300, { message: "Bio must be less than 300 characters" }),
  travel_intentions: z.array(z.object({
    destination: z.string().min(1, { message: "Destination is required" }),
    timeframe: z.string().min(1, { message: "Timeframe is required" }),
    is_confirmed: z.boolean(),
  })),
});

export type ProfileEditForm = z.infer<typeof profileEditSchema>;

