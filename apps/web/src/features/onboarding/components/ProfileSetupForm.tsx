"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  GUIDELINES_VERSION,
} from "@/lib/policy-versions";
import {
  UserRound,
  Building2,
  Earth,
  MessageSquareText,
  Lightbulb,
  CircleCheckBig,
  ChevronLeft,
  ChevronRight,
  ScanFace,
  X,
  Loader2,
  Trash2,
  Check,
  AlertCircle,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { useSyncUserToSupabase } from "@kovari/api/client";

// Import UI components
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Command,
  CommandList,
  CommandInput,
  CommandGroup,
  CommandEmpty,
} from "@/shared/components/ui/command";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@kovari/utils";
import { DatePicker } from "@/shared/components/ui/date-picker";
import ProfileCropModal from "@/shared/components/profile-crop-modal";
import CheckIcon from "@mui/icons-material/Check";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { Avatar, Spinner } from "@heroui/react";
import { COUNTRIES } from "@kovari/utils";
import { LocationAutocomplete } from "@/shared/components/ui/location-autocomplete";
import { type LocationData } from "@kovari/utils";

// Define schemas for each step
const step1Schema = z
  .object({
    firstName: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" })
      .max(50, { message: "First name must be less than 50 characters" }),
    lastName: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" })
      .max(50, { message: "Last name must be less than 50 characters" }),
    username: z
      .string()
      .min(3, { message: "Username must be at least 3 characters" })
      .max(32, { message: "Username must be less than 32 characters" })
      .regex(/^[a-zA-Z0-9_]+$/, {
        message: "Username can only contain letters, numbers, and underscores",
      }),
    gender: z.string().min(1, { message: "Please select your gender" }),
    birthday: z.date({
      required_error: "Your date of birth is required.",
    }),
  })
  .refine(
    (data) => {
      const today = new Date();
      let age = today.getFullYear() - data.birthday.getFullYear();
      const monthDiff = today.getMonth() - data.birthday.getMonth();
      const dayDiff = today.getDate() - data.birthday.getDate();
      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
      return age >= 18 && age <= 100;
    },
    {
      message: "You must be atleast 18 years old",
      path: ["birthday"],
    }
  );

const step2Schema = z.object({
  bio: z
    .string()
    .max(300, { message: "Bio must be less than 300 characters" })
    .optional(),
  profilePic: z.any().optional(),
  location: z.string().min(1, { message: "Please select your location" }),
  nationality: z.string().optional(),
  jobType: z.string().optional(),
  languages: z
    .array(z.string())
    .min(1, { message: "Please select at least one language" }),
  interests: z
    .array(z.string())
    .min(1, { message: "Please select at least one interest" }),
  religion: z.string().optional(),
  smoking: z.string().optional(),
  drinking: z.string().optional(),
  personality: z
    .string()
    .min(1, { message: "Please select your personality type" }),
  foodPreference: z
    .string()
    .min(1, { message: "Please select food preference" }),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

// Sample data for dropdowns
const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];

const languageOptions = [
  "English",
  "Hindi",
  "Bengali",
  "Telugu",
  "Marathi",
  "Tamil",
  "Gujarati",
  "Urdu",
  "Kannada",
  "Malayalam",
  "Punjabi",
];

const nationalityOptions = COUNTRIES;

const interestOptions = [
  // How they travel
  { id: "solo-backpacking", label: "Solo Backpacking" },
  { id: "weekend-getaways", label: "Weekend Getaways" },
  { id: "long-term-travel", label: "Long-Term Travel" },
  { id: "workations", label: "Workations" },
  { id: "road-trips", label: "Road Trips" },
  { id: "train-journeys", label: "Train Journeys" },

  // Mountains & outdoors
  { id: "himalayan-treks", label: "Himalayan Treks" },
  { id: "camping-stargazing", label: "Camping & Stargazing" },
  { id: "river-rafting", label: "River Rafting" },
  { id: "skiing-snow", label: "Skiing & Snow" },
  { id: "wildlife-safaris", label: "Wildlife & Safaris" },

  // Beaches & water
  { id: "beach-bumming", label: "Beach Bumming" },
  { id: "scuba-snorkeling", label: "Scuba & Snorkeling" },
  { id: "island-hopping", label: "Island Hopping" },

  // Food & local
  { id: "street-food-crawls", label: "Street Food Crawls" },
  { id: "local-markets", label: "Local Markets" },
  { id: "chai-conversations", label: "Chai & Conversations" },

  // Culture & art
  { id: "heritage-history", label: "Heritage & History" },
  { id: "art-galleries", label: "Art & Galleries" },
  { id: "music-festivals", label: "Music & Festivals" },
  { id: "spiritual-travel", label: "Spiritual Travel" },

  // Photography & content
  { id: "photography", label: "Photography" },
  { id: "aesthetic-spots", label: "Aesthetic Spots" },

  // Nightlife
  { id: "nightlife-clubs", label: "Nightlife & Clubs" },
];

const religionOptions = [
  "Christianity",
  "Islam",
  "Hinduism",
  "Buddhism",
  "Judaism",
  "Sikhism",
  "Atheist",
  "Agnostic",
  "Other",
  "Prefer not to say",
];

const smokingOptions = [
  "Yes",
  "No",
  "Occasionally",
  "Prefer not to say",
];

const drinkingOptions = [
  "Yes",
  "No",
  "Socially",
  "Prefer not to say",
];

const personalityOptions = [
  "Introvert",
  "Extrovert",
  "Ambivert",
  "Mixed / Not sure",
  "Prefer not to say",
];

const foodPreferenceOptions = [
  "Vegetarian",
  "Vegan",
  "Non-vegetarian",
  "Pescatarian",
  "Halal",
  "Kosher",
  "No preference",
];



export default function ProfileSetupForm() {
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Travel intent state
  const [travelIntents, setTravelIntents] = useState<Array<{
    destination: string;
    destination_details?: any;
    rough_dates: string;
    budget_range: string;
    travel_style: string;
    is_confirmed: boolean;
  }>>([]);

  const [intentDestination, setIntentDestination] = useState("");
  const [intentDestinationDetails, setIntentDestinationDetails] = useState<any>(null);
  const [intentRoughDates, setIntentRoughDates] = useState("Next 1-2 months");
  const [intentBudgetRange, setIntentBudgetRange] = useState("₹10,000 - ₹25,000");
  const [intentTravelStyle, setIntentTravelStyle] = useState("Budget backpacker");
  const [intentConfirmed, setIntentConfirmed] = useState(false);
  const [intentLocationDetails, setIntentLocationDetails] = useState<LocationData | null>(null);
  const [completeClickedOnce, setCompleteClickedOnce] = useState(false);
  const [showMorePrefs, setShowMorePrefs] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [nationalityQuery, setNationalityQuery] = useState("");
  const languageTriggerRef = useRef<HTMLDivElement>(null);
  const interestTriggerRef = useRef<HTMLDivElement>(null);
  const [languagePopoverWidth, setLanguagePopoverWidth] = useState<
    number | undefined
  >(undefined);
  const [interestPopoverWidth, setInterestPopoverWidth] = useState<
    number | undefined
  >(undefined);
  const [locationDetails, setLocationDetails] = useState<LocationData | null>(null);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [usernameCheckError, setUsernameCheckError] = useState<string | null>(
    null
  );
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const [syncUserError, setSyncUserError] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string>("");
  const [cropLoading, setCropLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { syncUser } = useSyncUserToSupabase();

  // Sync user to Supabase when component mounts
  useEffect(() => {
    syncUser();
  }, [syncUser]);



  // Measure trigger widths for popover content matching
  useEffect(() => {
    if (languageOpen && languageTriggerRef.current) {
      setLanguagePopoverWidth(languageTriggerRef.current.offsetWidth);
    }
  }, [languageOpen]);

  useEffect(() => {
    if (interestOpen && interestTriggerRef.current) {
      setInterestPopoverWidth(interestTriggerRef.current.offsetWidth);
    }
  }, [interestOpen]);

  // Initialize forms for each step
  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      gender: "",
      birthday: undefined,
    },
  });

  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      bio: "",
      profilePic: null,
      location: "",
      nationality: "",
      jobType: "",
      languages: [],
      interests: [],
      religion: "",
      smoking: "",
      drinking: "",
      personality: "",
      foodPreference: "",
    },
  });



  // Pre-fill name and username fields from Clerk when user is loaded
  useEffect(() => {
    if (user) {
      if (user.firstName && !step1Form.getValues("firstName")) {
        step1Form.setValue("firstName", user.firstName, { shouldValidate: true });
      }
      if (user.lastName && !step1Form.getValues("lastName")) {
        step1Form.setValue("lastName", user.lastName, { shouldValidate: true });
      }
      if (!step1Form.getValues("username")) {
        let suggestedUsername = "";
        if (user.username && !user.username.startsWith("user_")) {
          suggestedUsername = user.username;
        } else if (user.firstName) {
          suggestedUsername = `${user.firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}${Math.floor(10 + Math.random() * 90)}`;
        } else if (user.primaryEmailAddress?.emailAddress) {
          const emailPrefix = user.primaryEmailAddress.emailAddress.split("@")[0];
          suggestedUsername = `${emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, "")}${Math.floor(10 + Math.random() * 90)}`;
        }
        if (suggestedUsername) {
          step1Form.setValue("username", suggestedUsername, { shouldValidate: true });
        }
      }
    }
  }, [user, step1Form]);

  // Async username uniqueness check
  const checkUsernameUnique = async (username: string) => {
    setUsernameCheckError(null);
    setUsernameAvailable(null);
    if (!username || username.length < 3) return true;
    
    setUsernameCheckLoading(true);
    try {
      const res = await fetch("/api/check-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!data.available) {
        setUsernameCheckError("Username is already taken");
        setUsernameAvailable(false);
        return false;
      }
      setUsernameCheckError(null);
      setUsernameAvailable(true);
      return true;
    } catch (e) {
      setUsernameCheckError("Could not check username");
      setUsernameAvailable(false);
      return false;
    } finally {
      setUsernameCheckLoading(false);
    }
  };

  const usernameValue = step1Form.watch("username");
  
  // Debounced username check
  useEffect(() => {
    const check = async () => {
      // Clear previous status on change
      setUsernameCheckError(null);
      setUsernameAvailable(null);
      
      const username = usernameValue;
      if (!username) return;
      
      // Basic validation based on schema before API call
      if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
         return;
      }

      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
      
      setUsernameCheckLoading(true);
      usernameCheckTimeout.current = setTimeout(async () => {
        await checkUsernameUnique(username);
      }, 500);
    };
    check();
    
    return () => {
      if (usernameCheckTimeout.current) {
         clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [usernameValue]);

  const handleAvatarUpload = async (file: File) => {
    setPhotoError(null);
    const acceptedFormats = ["PNG", "JPG", "JPEG", "WEBP"];
    const maxSizeInMB = 10;

    if (file.size > maxSizeInMB * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSizeInMB}MB`);
      return;
    }

    const fileExtension = file.name.split(".").pop()?.toUpperCase();
    if (!fileExtension || !acceptedFormats.includes(fileExtension)) {
      toast.error(`Only ${acceptedFormats.join(", ")} files are supported`);
      return;
    }

    const tempUrl = URL.createObjectURL(file);
    setTempImageUrl(tempUrl);
    setCropModalOpen(true);
  };

  const handleProfileFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void handleAvatarUpload(files[0]);
    }
    if (event.target) {
      event.target.value = "";
    }
  };

  const handleProfileCropComplete = async (croppedImage: string | Blob) => {
    setCropLoading(true);
    try {
      let blob: Blob;
      if (typeof croppedImage === "string") {
        const response = await fetch(croppedImage);
        blob = await response.blob();
      } else {
        blob = croppedImage;
      }
      const file = new File([blob], "profile-crop.jpg", {
        type: "image/jpeg",
      });

      // 1. Get signature
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "kovari-profiles" }),
      });
      if (!signRes.ok) throw new Error("Failed to get Cloudinary signature");
      const responseJson = await signRes.json();
      const { signature, timestamp, folder, api_key, cloud_name } = responseJson.data;

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", api_key);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Cloudinary upload failed");
      
      const uploaded = await uploadRes.json();
      const url = uploaded.secure_url;
      if (!url) {
        throw new Error("No URL returned from upload");
      }

      setProfileImage(url);
      step2Form.setValue("profilePic", url, { shouldValidate: true });
      setPhotoError(null);
      toast.success("Profile photo updated successfully!");
      setCropModalOpen(false);
    } catch (error) {
      console.error("Cropped image upload error:", error);
      setPhotoError("Upload failed, try again");
      toast.error("Failed to upload profile photo");
    } finally {
      setCropLoading(false);
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl);
        setTempImageUrl("");
      }
      if (typeof croppedImage === "string" && croppedImage.startsWith("blob:")) {
        URL.revokeObjectURL(croppedImage);
      }
    }
  };

  const handleCropModalOpenChange = (open: boolean) => {
    if (!open) {
      setCropModalOpen(false);
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl);
        setTempImageUrl("");
      }
    } else {
      setCropModalOpen(true);
    }
  };

  // Skip photo handler: bypass profilePic validation, keep other validations active, and advance step
  const handleSkipPhoto = async () => {
    const valid = await step2Form.trigger(["bio"], { shouldFocus: true });
    if (!valid) return;
    step2Form.setValue("profilePic", null, { shouldValidate: false });
    setProfileImage(null);
    setPhotoError(null);
    setStep(3);
  };

  // Step-scoped next navigation with partial validation
  const handleNext = async () => {
    if (step === 1) {
      const valid = await step1Form.trigger(
        ["firstName", "lastName", "username"],
        { shouldFocus: true }
      );
      if (!valid) return;
      const username = step1Form.getValues("username");
      // If we haven't checked availability yet or it's not available (and valid format), re-check
       if (!usernameAvailable && !usernameCheckError) {
           const isUnique = await checkUsernameUnique(username);
           if (!isUnique) {
              toast.error("Username is already taken or invalid");
              return;
           }
       } else if (usernameCheckError || usernameAvailable === false) {
           toast.error("Please fix username errors");
           return;
       }
      setStep(2);
      return;
    }
    if (step === 2) {
      const isBioValid = await step2Form.trigger(["bio"], { shouldFocus: true });
      if (!isBioValid) return;

      const profilePicValue = step2Form.getValues("profilePic");
      if (!profilePicValue) {
        setPhotoError("Please add a profile photo to continue, or tap 'Skip photo for now'.");
        return;
      }
      setPhotoError(null);
      setStep(3);
      return;
    }
    if (step === 3) {
      const valid = await step1Form.trigger(["gender", "birthday"], {
        shouldFocus: true,
      });
      if (!valid) return;
      setStep1Data(step1Form.getValues());
      setStep(4);
      return;
    }
    if (step === 4) {
      const valid = await step2Form.trigger(
        ["location", "nationality", "jobType"],
        { shouldFocus: true }
      );
      if (!valid) return;
      setStep(5);
      return;
    }
    if (step === 5) {
      const valid = await step2Form.trigger(["languages", "interests"], {
        shouldFocus: true,
      });
      if (!valid) return;
      setStep(6);
      return;
    }
    if (step === 6) {
      const valid = await step2Form.trigger(
        ["personality", "foodPreference"],
        { shouldFocus: true }
      );
      if (!valid) return;
      setStep(7);
      return;
    }
    if (step === 7) {
      // Travel intent step — fully optional, always allow proceeding
      setStep(8);
      return;
    }
    if (step === 8) {
      const valid = await step2Form.trigger(
        ["religion", "smoking", "drinking"],
        { shouldFocus: true }
      );
      if (!valid) return;
      if (!policyAccepted) {
        toast.error("Please accept the policies to continue");
        return;
      }
      setStep2Data(step2Form.getValues());
      await submitProfileAndPreferences();
      return;
    }
  };

  // Handle step 2 submission
  const onStep2Submit = (data: Step2Data) => {
    console.log("Step 2 data:", data);
    setStep2Data(data);
    setStep(3);
  };




  // Format date as ISO datetime string at midnight UTC to preserve the selected date
  const formatDateOnly = (date: Date | undefined): string | undefined => {
    if (!date) return undefined;
    // Get the date components in local timezone
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    // Create a new date at midnight UTC using the same year/month/day
    // This preserves the date without timezone shifting
    const utcDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    return utcDate.toISOString();
  };

  // Original step 3 submission logic moved to a separate function
  const submitProfileAndPreferences = async () => {
    const readErrorMessage = async (res: Response) => {
      const tryFormatZod = (payload: any) => {
        const err = payload?.error ?? payload;
        if (err && typeof err === "object" && err.fieldErrors) {
          const fieldEntries = Object.entries(
            err.fieldErrors as Record<string, string[]>
          )
            .filter(([, v]) => Array.isArray(v) && v.length > 0)
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v[0]}`);
          if (fieldEntries.length)
            return `Validation failed - ${fieldEntries.join(", ")}`;
        }
        return null;
      };
      try {
        const json = await res.clone().json();
        if (json && typeof json === "object") {
          const zodMsg = tryFormatZod(json);
          if (zodMsg) return zodMsg;
          const errorVal = (json as any).error;
          if (typeof errorVal === "string") return errorVal;
          if (errorVal && typeof errorVal === "object")
            return JSON.stringify(errorVal);
          if (typeof (json as any).message === "string")
            return (json as any).message;
          return JSON.stringify(json);
        }
      } catch {}
      try {
        const text = await res.text();
        if (text) return text;
      } catch {}
      return `${res.status} ${res.statusText}`;
    };
    try {
      setIsSubmitting(true);
      setSyncUserError(null);
      // Use form values directly if state is not yet updated (React state updates are async)
      const currentStep1Data = step1Data || step1Form.getValues();
      const currentStep2Data = step2Data || step2Form.getValues();
      const completeData = {
        ...currentStep1Data,
        ...currentStep2Data,
      };
      console.log("Complete form data:", completeData);

      // Validate that all required fields are present
      if (
        !completeData.firstName ||
        !completeData.lastName ||
        !completeData.username
      ) {
        throw new Error("Please complete all required fields in step 1");
      }
      if (
        !completeData.location
      ) {
        throw new Error("Please complete all required fields in step 4");
      }
      if (!completeData.languages || completeData.languages.length === 0) {
        throw new Error("Please select at least one language");
      }

      // Transform data to match API schema
      const interestsLabels = (completeData.interests || [])
        .map((id) => interestOptions.find((opt) => opt.id === id)?.label)
        .filter(Boolean) as string[];
      const computeAge = (dob?: Date) => {
        if (!dob) return 18;
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        if (!Number.isFinite(age) || age < 0) return 18;
        return age;
      };
      const numericAge = computeAge(completeData.birthday as Date | undefined);

      // Ensure all required fields have valid values
      const formattedBirthday = formatDateOnly(completeData.birthday);
      if (!formattedBirthday) {
        throw new Error("Birthday is required");
      }

      const profileData = {
        name: `${completeData.firstName} ${completeData.lastName}`,
        firstName: completeData.firstName,
        lastName: completeData.lastName,
        username: completeData.username,
        age: Number.isFinite(numericAge) ? numericAge : 18,
        gender: completeData.gender,
        birthday: formattedBirthday,
        bio: completeData.bio || "",
        profile_photo:
          typeof completeData.profilePic === "string" &&
          /^https?:\/\//i.test(completeData.profilePic)
            ? (completeData.profilePic as string)
            : undefined,
        // Merge structured location data if available
        location: completeData.location || "",
        location_details: locationDetails ? {
          city: locationDetails.city,
          state: locationDetails.state,
          country: locationDetails.country,
          latitude: locationDetails.lat,
          longitude: locationDetails.lon,
          formatted_address: locationDetails.formatted,
          place_id: locationDetails.place_id
        } : undefined,
        languages:
          Array.isArray(completeData.languages) &&
          completeData.languages.length > 0
            ? completeData.languages
            : [],
        nationality: completeData.nationality || "Indian",
        job: completeData.jobType || "",
        religion: completeData.religion || "Prefer not to say",
        smoking: completeData.smoking || "Prefer not to say",
        drinking: completeData.drinking || "Prefer not to say",
        personality: completeData.personality || "",
        food_preference: completeData.foodPreference || "",
        interests: interestsLabels,
        travel_intentions: travelIntents,
      };



      if (!user) {
        throw new Error("User not found");
      }

      // Step 1: Update Clerk user profile metadata
      await user.update({
        unsafeMetadata: {
          imageUrl: completeData.profilePic || undefined,
          age: numericAge,
          gender: completeData.gender,
          birthday: formatDateOnly(completeData.birthday),
          bio: completeData.bio,
          nationality: completeData.nationality,
          jobType: completeData.jobType,
          location: completeData.location,
          languages: completeData.languages,
          interests: interestsLabels,
          religion: completeData.religion,
          smoking: completeData.smoking,
          drinking: completeData.drinking,
          personality: completeData.personality,
          foodPreference: completeData.foodPreference,
        },
      });

      // Step 2: Sync user to Supabase
      const syncSuccess = await syncUser();
      if (!syncSuccess) {
        setSyncUserError(
          "Failed to sync your account to our database. Please check your connection and try again."
        );
        toast.error(
          "Failed to sync your account to our database. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      // Step 3: Submit profile data to ATOMIC creation API
      // This endpoint is the single source of truth for onboarding completion
      const profileRes = await fetch("/api/profile/create", {
        method: "POST",
        body: JSON.stringify(profileData),
        headers: { "Content-Type": "application/json" },
      });

      if (!profileRes.ok) {
        const errorMsg = await readErrorMessage(profileRes);
        throw new Error(`Profile (${profileRes.status}): ${errorMsg}`);
      }



      toast.success("Profile saved successfully!");

      // Record policy acceptance
      try {
        console.log("Submitting policy acceptance with:", { TERMS_VERSION, PRIVACY_VERSION, GUIDELINES_VERSION });
        const policyRes = await fetch("/api/settings/accept-policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_VERSION,
            guidelinesVersion: GUIDELINES_VERSION,
          }),
        });
        const policyText = await policyRes.text();
        console.log("Policy acceptance response status:", policyRes.status, "body:", policyText);
        if (!policyRes.ok) {
          console.error("Failed to record policy acceptance:", policyText);
        }
      } catch (err) {
        console.error("Error calling accept-policies API:", err);
      }

      setStep(9);
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error.message || "Failed to save profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Go back to previous step
  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Progress indicator component
  const ProgressIndicator = () =>
    step <= totalSteps ? (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Step {step} of {totalSteps}
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((stepNum) => (
            <div
              key={stepNum}
              className={`h-1.5 rounded-full ${
                stepNum <= step ? "bg-primary" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    ) : null;

  // Step 1 - Identity
  const renderStep1 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Let&apos;s get started
        </h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s build your traveler profile
        </p>
      </div>

      <Form {...step1Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField
              control={step1Form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    First Name (Required)
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="John"
                        className="h-9 text-sm border-input focus:border-primary focus:ring-primary rounded-lg placeholder:text-muted-foreground "
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={step1Form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Last Name (Required)
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Doe"
                        className="h-9 text-sm border-input focus:border-primary focus:ring-primary rounded-lg placeholder:text-muted-foreground"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Username Field */}
          <FormField
            control={step1Form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Username (Required)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="your_username"
                      className={cn(
                        "h-9 text-sm border-input rounded-lg placeholder:text-muted-foreground w-full pr-10",
                        usernameCheckError && "border-destructive focus-visible:border-destructive",
                        usernameAvailable && !usernameCheckError && "border-green-500 focus-visible:border-green-500"
                      )}
                      autoComplete="username"
                      {...field}
                    />
                    <div className="absolute right-2.5 top-2.5 select-none pointer-events-none">
                     {usernameCheckLoading ? (
                        <Spinner variant="spinner" size="sm" classNames={{ spinnerBars: "bg-primary" }}/>
                      ) : usernameAvailable ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : usernameCheckError || (field.value && field.value.length >= 3 && !usernameCheckLoading && !usernameAvailable && usernameAvailable !== null) ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : null}
                    </div>
                  </div>
                </FormControl>
                <p className="text-[10px] text-muted-foreground mt-1">
                  You can change this anytime in settings
                </p>
                <FormMessage className="text-xs">
                  {usernameCheckError}
                </FormMessage>
              </FormItem>
            )}
          />

          <div className="pt-3">
            <Button
              type="submit"
              className="w-full h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Step 2 - Media & Bio
  const renderStep2 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Profile picture
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a profile photo — it helps others trust you
        </p>
      </div>

      <Form {...step2Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          {/* Profile Picture */}
          <FormField
            control={step2Form.control}
            name="profilePic"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Profile Picture (Required)
                </FormLabel>
                <FormControl>
                  <div className="flex flex-col items-center gap-0 md:gap-4 rounded-xl border border-input px-4 py-4 md:flex-row md:items-center">
                    <div className="h-20 w-20 rounded-full bg-background flex items-center justify-center overflow-hidden md:h-16 md:w-16">
                      {profileImage ? (
                        <Image
                          src={profileImage}
                          alt="Profile"
                          width={80}
                          height={80}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <Avatar
                          src=""
                          showFallback
                          fallback={
                            <svg
                              className="w-full h-full text-gray-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <circle cx="12" cy="8" r="4" />
                              <rect x="4" y="14" width="16" height="6" rx="3" />
                            </svg>
                          }
                          className="h-20 w-20 bg-secondary"
                        />
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-0 md:w-auto">
                      <div className="flex items-center gap-1 justify-center md:justify-start">
                        <Button
                          type="button"
                          size="sm"
                          className="mt-4 md:mt-0 bg-transparent border border-border hover:bg-gray-200 shadow-none rounded-lg px-3 py-1 text-xs transition-all duration-300 disabled:opacity-50"
                          aria-label="Upload profile photo"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={cropLoading}
                        >
                          {cropLoading ? (
                            <Spinner
                              variant="spinner"
                              size="sm"
                              classNames={{ spinnerBars: "bg-black" }}
                            />
                          ) : (
                            <span className="text-xs text-primary">
                              {profileImage
                                ? "Change profile picture"
                                : "Upload profile picture"}
                            </span>
                          )}
                        </Button>
                        {profileImage && (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-4 md:mt-0 px-3 py-1 bg-transparent border border-border shadow-none rounded-lg text-destructive hover:bg-gray-200 transition-all duration-300 disabled:opacity-50"
                            aria-label="Remove profile photo"
                            onClick={() => {
                              if (cropLoading) return;
                              setProfileImage(null);
                              field.onChange(null);
                              setPhotoError(null);
                            }}
                            disabled={cropLoading}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSkipPhoto}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors self-center md:self-start mt-2"
                      >
                        Skip photo for now
                      </button>
                      {photoError && (
                        <p className="text-xs text-destructive mt-1.5 font-medium text-center md:text-left animate-in fade-in slide-in-from-top-1 duration-200">
                          {photoError}
                        </p>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp"
                        onChange={handleProfileFileSelect}
                        className="hidden"
                        aria-label="Upload profile photo"
                      />
                      {/* <p className="text-[11px] text-muted-foreground text-center md:text-left hidden md:block mt-1">
                        Recommended at least 400×400px. JPG, PNG or WEBP, up to
                        10MB.
                      </p> */}
                    </div>
                  </div>
                </FormControl>
                {/* <FormMessage className="text-xs">
                  Upload profile picture
                </FormMessage> */}
              </FormItem>
            )}
          />

          {/* Bio */}
          <FormField
            control={step2Form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Bio (Optional)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Textarea
                      placeholder="Tell us about yourself..."
                      className="min-h-[80px] text-sm rounded-lg resize-none placeholder:text-muted-foreground"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          {/* Navigation Buttons */}
          <div className="flex space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Step 3 - Demographics (gender, birthday)
  const renderDemographics = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">About you</h1>
        <p className="text-sm text-muted-foreground">Gender and birthday</p>
      </div>

      <Form {...step1Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          <FormField
            control={step1Form.control}
            name="birthday"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Date of Birth (Required)
                </FormLabel>
                <FormControl>
                  <DatePicker
                    startYear={1950}
                    endYear={new Date().getFullYear()}
                    date={field.value}
                    onDateChange={field.onChange}
                    disabled={{
                      before: new Date(1900, 0, 1),
                      after: new Date(),
                    }}
                    placeholder="Select your date of birth"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={step1Form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Gender (Required)
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full h-9 text-sm border-border focus:border-primary focus:ring-primary rounded-lg placeholder:text-muted-foreground">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {genderOptions.map((gender) => (
                      <SelectItem
                        key={gender}
                        value={gender}
                        className="text-sm"
                      >
                        {gender}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <div className="flex space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Step 4 - Location / Nationality / Job
  const renderLocation = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Where are you based?
        </h1>
        <p className="text-sm text-muted-foreground">
          Your city and job type
        </p>
      </div>
      <Form {...step2Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          <FormField
            control={step2Form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Your City (Required)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <LocationAutocomplete
                      value={field.value}
                      onChange={(val) => {
                          field.onChange(val);
                      }}
                      onSelect={(data) => {
                        field.onChange(data.formatted);
                        setLocationDetails(data);
                      }}
                      placeholder="Search your city..."
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={step2Form.control}
            name="jobType"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Job Type (Optional)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="Enter your job type"
                      className="h-9 text-sm border-border focus:border-primary focus:ring-primary rounded-lg placeholder:text-muted-foreground"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <div className="flex space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Step 5 - Languages & Interests
  const renderLanguages = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Languages & interests
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell us what you speak and like
        </p>
      </div>
      <Form {...step2Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          {/* Languages */}
          {(() => {
            return (
              <FormField
                control={step2Form.control}
                name="languages"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Languages (Required)
                    </FormLabel>
                    <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
                      <div ref={languageTriggerRef}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "bg-white w-full h-9 text-sm font-normal justify-between border-input rounded-lg",
                                !field.value?.length &&
                                  "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
                              )}
                            >
                              <div className="flex items-center text-muted-foreground">
                                {field.value?.length
                                  ? `${field.value.length} language${field.value.length > 1 ? "s" : ""} selected`
                                  : "Select languages"}
                              </div>
                              <ChevronRight className="ml-2 h-3.5 w-3.5 shrink-0 " />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                      </div>
                      <PopoverContent
                        className="p-0"
                        align="start"
                        style={{
                          width: languagePopoverWidth
                            ? `${languagePopoverWidth}px`
                            : undefined,
                        }}
                      >
                        <Command>
                          <CommandList>
                            <CommandGroup className="max-h-64 w-full overflow-auto hide-scrollbar">
                              {languageOptions.map((language) => (
                                <div
                                  key={language}
                                  className="px-2 py-1.5 text-sm text-muted-foreground rounded-sm cursor-pointer hover:bg-secondary flex items-center"
                                  onClick={() => {
                                    const newValue = field.value?.includes(
                                      language
                                    )
                                      ? field.value.filter(
                                          (l) => l !== language
                                        )
                                      : [...(field.value || []), language];
                                    field.onChange(newValue);
                                    setLanguageOpen(true);
                                  }}
                                >
                                  {field.value?.includes(language) ? (
                                    <CheckIcon
                                      fontSize="inherit"
                                      className="mr-2 text-muted-foreground flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                                  )}
                                  <span className="font-medium">
                                    {language}
                                  </span>
                                </div>
                              ))}
                            </CommandGroup>
                          </CommandList>
                          {field.value?.length > 0 && (
                            <div className="border-t p-4">
                              <div className="flex flex-wrap gap-1">
                                {field.value.map((language) => (
                                  <Badge
                                    key={language}
                                    variant="secondary"
                                    className="text-xs font-medium bg-secondary text-foreground px-3 py-1.5"
                                  >
                                    {language}
                                    <button
                                      type="button"
                                      className="ml-1 text-foreground rounded-full"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        field.onChange(
                                          field.value.filter(
                                            (l) => l !== language
                                          )
                                        );
                                      }}
                                      title={`Remove ${language}`}
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="border-t p-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs bg-white border-input hover:text-foreground"
                              onClick={() => setLanguageOpen(false)}
                            >
                              Done
                            </Button>
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {field.value?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {field.value.map((language) => (
                          <Badge
                            key={language}
                            variant="secondary"
                            className="text-xs font-medium bg-secondary text-foreground"
                          >
                            {language}
                            <button
                              type="button"
                              className="ml-1 text-foreground"
                              onClick={() => {
                                field.onChange(
                                  field.value.filter((l) => l !== language)
                                );
                              }}
                              title={`Remove ${language}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            );
          })()}
          {/* Interests */}
          {(() => {
            return (
              <FormField
                control={step2Form.control}
                name="interests"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Interests (Required)
                    </FormLabel>
                    <Popover open={interestOpen} onOpenChange={setInterestOpen}>
                      <div ref={interestTriggerRef}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "bg-white w-full h-9 text-sm font-normal justify-between border-input rounded-lg",
                                !field.value?.length &&
                                  "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
                              )}
                            >
                              <div className="flex items-center text-muted-foreground">
                                {field.value?.length
                                  ? `${field.value.length} interest${field.value.length > 1 ? "s" : ""} selected`
                                  : "Select interests"}
                              </div>
                              <ChevronRight className="ml-2 h-3.5 w-3.5 shrink-0 " />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                      </div>
                      <PopoverContent
                        className="p-0"
                        align="start"
                        style={{
                          width: interestPopoverWidth
                            ? `${interestPopoverWidth}px`
                            : undefined,
                        }}
                      >
                        <Command>
                          <CommandList>
                            <CommandGroup className="max-h-64 overflow-auto hide-scrollbar">
                              {interestOptions.map((interest) => (
                                <div
                                  key={interest.id}
                                  className="px-2 py-1.5 text-sm text-muted-foreground rounded-sm cursor-pointer hover:bg-secondary flex items-center"
                                  onClick={() => {
                                    const newValue = field.value?.includes(
                                      interest.id
                                    )
                                      ? field.value.filter(
                                          (i) => i !== interest.id
                                        )
                                      : [...(field.value || []), interest.id];
                                    field.onChange(newValue);
                                    setInterestOpen(true);
                                  }}
                                >
                                  {field.value?.includes(interest.id) ? (
                                    <CheckIcon
                                      fontSize="inherit"
                                      className="mr-2 text-muted-foreground flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                                  )}
                                  <span className="font-medium">
                                    {interest.label}
                                  </span>
                                </div>
                              ))}
                            </CommandGroup>
                          </CommandList>
                          {field.value?.length > 0 && (
                            <div className="border-t p-4">
                              <div className="flex flex-wrap gap-1">
                                {field.value.map((interestId) => {
                                  const interest = interestOptions.find(
                                    (opt) => opt.id === interestId
                                  );
                                  return interest ? (
                                    <Badge
                                      key={interest.id}
                                      variant="secondary"
                                      className="text-xs font-medium bg-secondary text-foreground px-3 py-1.5"
                                    >
                                      {interest.label}
                                      <button
                                        type="button"
                                        className="ml-1 text-foreground rounded-full"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          field.onChange(
                                            field.value.filter(
                                              (i) => i !== interestId
                                            )
                                          );
                                        }}
                                        title={`Remove ${interest.label}`}
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}
                          <div className="border-t p-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs bg-white border-input hover:text-foreground"
                              onClick={() => setInterestOpen(false)}
                            >
                              Done
                            </Button>
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {field.value?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {field.value.map((interestId) => {
                          const interest = interestOptions.find(
                            (opt) => opt.id === interestId
                          );
                          return interest ? (
                            <Badge
                              key={interest.id}
                              variant="secondary"
                              className="text-xs font-medium bg-secondary text-foreground"
                            >
                              {interest.label}
                              <button
                                type="button"
                                className="ml-1 text-foreground"
                                onClick={() => {
                                  field.onChange(
                                    field.value.filter((i) => i !== interestId)
                                  );
                                }}
                                title={`Remove ${interest.label}`}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            );
          })()}
          <div className="flex space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Step 6 - Lifestyle (Personality & Food Preference)
  const renderLifestyle = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-foreground mb-1">Lifestyle</h1>
        <p className="text-sm text-muted-foreground">
          Personality and food preference
        </p>
      </div>
      <Form {...step2Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          <FormField
            control={step2Form.control}
            name="personality"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Personality (Required)
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full h-9 text-sm border-input focus:border-primary focus:ring-primary rounded-lg">
                      <SelectValue placeholder="Select personality" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {personalityOptions.map((p) => (
                      <SelectItem key={p} value={p} className="text-sm">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={step2Form.control}
            name="foodPreference"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground">
                  Food Preference (Required)
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full h-9 text-sm border-input focus:border-primary focus:ring-primary rounded-lg">
                      <SelectValue placeholder="Select food preference" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {foodPreferenceOptions.map((option) => (
                      <SelectItem
                        key={option}
                        value={option}
                        className="text-sm"
                      >
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <div className="flex space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  const renderTravelIntent = () => {
    const roughDateOptions = [
      "Next 2-4 weeks",
      "Next 1-2 months", 
      "Next 3-6 months",
      "Next 6-12 months",
      "Not sure yet",
    ];

    const budgetOptions = [
      "Under ₹10,000",
      "₹10,000 - ₹25,000",
      "₹25,000 - ₹50,000",
      "₹50,000 - ₹1,00,000",
      "₹1,00,000+",
    ];

    const travelStyleOptions = [
      "Budget backpacker",
      "Mid-range comfort",
      "Premium",
      "Flexible",
    ];

    const addIntent = () => {
      if (!intentDestination.trim()) return;
      const newIntent = {
        destination: intentDestination,
        destination_details: intentDestinationDetails,
        rough_dates: intentRoughDates,
        budget_range: intentBudgetRange,
        travel_style: intentTravelStyle,
        is_confirmed: intentConfirmed,
      };
      setTravelIntents(prev => [...prev.slice(0, 2), newIntent]); // max 3
      setIntentDestination("");
      setIntentDestinationDetails(null);
      setIntentLocationDetails(null);
      setIntentRoughDates("Next 1-2 months");
      setIntentBudgetRange("₹10,000 - ₹25,000");
      setIntentTravelStyle("Budget backpacker");
      setIntentConfirmed(false);
    };

    const removeIntent = (index: number) => {
      setTravelIntents(prev => prev.filter((_, i) => i !== index));
    };

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="text-center mb-4">
          <h1 className="text-lg font-semibold text-foreground mb-1">
            Where do you want to go?
          </h1>
          <p className="text-sm text-muted-foreground">
            Add up to 3 trips you're planning or thinking about.
            This helps us match you with the right travelers.
          </p>
        </div>

        {/* Existing intents */}
        {travelIntents.length > 0 && (
          <div className="space-y-2">
            {travelIntents.map((intent, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {intent.destination}
                    {intent.is_confirmed && (
                      <span className="ml-2 text-xs text-green-600 font-normal">
                        ✓ confirmed
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {intent.rough_dates} · {intent.budget_range} · {intent.travel_style}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeIntent(index)}
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add intent form — only show if less than 3 */}
        {travelIntents.length < 3 && (
          <div className="space-y-3 p-3 rounded-lg border border-border bg-card">
            {/* Destination */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Where? {travelIntents.length === 0 && <span className="text-destructive">*</span>}
              </label>
              <LocationAutocomplete
                value={intentDestination}
                onChange={(val) => setIntentDestination(val)}
                onSelect={(data) => {
                  setIntentDestination(data.city || data.formatted.split(",")[0]);
                  setIntentDestinationDetails({
                    city: data.city,
                    state: data.state,
                    country: data.country,
                    lat: data.lat,
                    lon: data.lon,
                    formatted: data.formatted,
                    place_id: data.place_id,
                  });
                  setIntentLocationDetails(data);
                }}
                placeholder="Goa, Manali, Bali, Europe..."
                className="w-full rounded-lg"
              />
            </div>

            {/* Rough dates */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                When roughly?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {roughDateOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIntentRoughDates(option)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      intentRoughDates === option
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Budget per person?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {budgetOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIntentBudgetRange(option)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      intentBudgetRange === option
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Travel style */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Travel style?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {travelStyleOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIntentTravelStyle(option)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      intentTravelStyle === option
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirmed toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={intentConfirmed}
                onChange={(e) => setIntentConfirmed(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                I've actually decided to go (not just thinking about it)
              </span>
            </label>

            {/* Add button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!intentDestination.trim()}
              onClick={addIntent}
              className="w-full text-xs"
            >
              + Add this trip
            </Button>
          </div>
        )}

        {/* Skip hint */}
        <p className="text-center text-xs text-muted-foreground">
          {travelIntents.length === 0
            ? "You can skip this and add trips later from your profile."
            : `${travelIntents.length} trip${travelIntents.length > 1 ? "s" : ""} added. You can add ${3 - travelIntents.length} more.`
          }
        </p>

        {/* Navigation */}
        <div className="flex space-x-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <Button
            type="button"
            onClick={() => setStep(8)}
            className="flex-1 h-9 text-sm bg-primary text-primary-foreground font-medium rounded-lg"
          >
            {travelIntents.length > 0 ? "Continue" : "Skip for now"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.div>
    );
  };

  // Step 8 - Smoking, Drinking, Religion & Policies
  const renderSmokingDrinkingReligion = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-4">
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Almost there
        </h1>
        <p className="text-sm text-muted-foreground">
          A few optional preferences, then you&apos;re in.
        </p>
      </div>

      <Form {...step2Form}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleNext();
          }}
          className="space-y-4"
        >
          {/* Collapsible optional preferences */}
          <div>
            <button
              type="button"
              onClick={() => setShowMorePrefs(!showMorePrefs)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors w-full text-center"
            >
              {showMorePrefs
                ? "Hide optional preferences"
                : "Add preferences — religion, smoking, drinking"}
            </button>

            {showMorePrefs && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 pt-3"
              >
                <FormField
                  control={step2Form.control}
                  name="religion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Religion (Optional)
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full h-9 text-sm border-input rounded-lg bg-white">
                            <SelectValue placeholder="Select religion" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {religionOptions.map((religion) => (
                            <SelectItem key={religion} value={religion} className="text-sm">
                              {religion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={step2Form.control}
                    name="smoking"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">
                          Smoking (Optional)
                        </FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full h-9 text-sm border-input rounded-lg bg-white">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {smokingOptions.map((option) => (
                              <SelectItem key={option} value={option} className="text-sm">
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={step2Form.control}
                    name="drinking"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">
                          Drinking (Optional)
                        </FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full h-9 text-sm border-input rounded-lg bg-white">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {drinkingOptions.map((option) => (
                              <SelectItem key={option} value={option} className="text-sm">
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Policy acceptance — single clean block */}
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => {
                  setPolicyAccepted(e.target.checked);
                  if (e.target.checked) setCompleteClickedOnce(false);
                }}
                className="mt-0.5 flex-shrink-0 accent-primary w-4 h-4"
              />
              <span className="text-[12px] text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                I agree to the{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>
                {" "}and{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
                {" "}and acknowledge the{" "}
                <a
                  href="/community-guidelines"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Community Guidelines
                </a>
                .
              </span>
            </label>

            {completeClickedOnce && !policyAccepted && (
              <p className="text-[11px] text-destructive font-medium ml-7 animate-in fade-in slide-in-from-top-1 duration-200">
                Please accept to continue
              </p>
            )}
          </div>

          {/* Navigation */}
          <div className="flex space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-9 text-sm border-input text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !policyAccepted}
              onClick={() => {
                if (!policyAccepted) setCompleteClickedOnce(true);
              }}
              className="flex-1 h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating profile…
                </>
              ) : (
                <>
                  Complete
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );

  // Render step 4 - Success
  const renderStep4 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="text-center mb-4">
        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckIcon className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground mb-1">
          Welcome aboard! 🎉
        </h1>
        <p className="text-sm text-muted-foreground">
          Your profile has been successfully created. You&apos;re all set to get
          started!
        </p>
      </div>

      <Button
        onClick={() => router.replace("/dashboard")}
        className="w-full h-9 text-sm bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg transition-all duration-200"
      >
        Get Started
      </Button>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-6 custom-autofill-white">
      <Card className="w-full max-w-xl border-border bg-card shadow-none gap-3 px-2">
        <CardHeader>
          <ProgressIndicator />
        </CardHeader>
        <CardContent className="px-4 md:px-6 pb-6">
          {syncUserError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm flex flex-col items-center">
              <span>{syncUserError}</span>
              <Button
                className="mt-2"
                onClick={async () => {
                  setSyncUserError(null);
                  setIsSubmitting(true);
                  const syncSuccess = await syncUser();
                  setIsSubmitting(false);
                  if (!syncSuccess) {
                    setSyncUserError(
                      "Failed to sync your account to our database. Please try again."
                    );
                  } else {
                    toast.success("Account synced! Please continue.");
                  }
                }}
              >
                Retry Sync
              </Button>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && <div key="step1">{renderStep1()}</div>}
            {step === 2 && <div key="step2">{renderStep2()}</div>}
            {step === 3 && <div key="step3">{renderDemographics()}</div>}
            {step === 4 && <div key="step4">{renderLocation()}</div>}
            {step === 5 && <div key="step5">{renderLanguages()}</div>}
            {step === 6 && <div key="step6">{renderLifestyle()}</div>}
            {step === 7 && <div key="step7">{renderTravelIntent()}</div>}
            {step === 8 && <div key="step8">{renderSmokingDrinkingReligion()}</div>}
            {step === 9 && <div key="step9">{renderStep4()}</div>}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Profile photo crop modal */}
      <ProfileCropModal
        open={cropModalOpen}
        onOpenChange={handleCropModalOpenChange}
        imageUrl={tempImageUrl}
        onCropComplete={handleProfileCropComplete}
        isLoading={cropLoading}
      />

      {/* Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-transparent rounded-lg p-6 flex flex-col items-center space-y-4">
            <Spinner
              variant="spinner"
              size="md"
              classNames={{ spinnerBars: "bg-primary-foreground" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

