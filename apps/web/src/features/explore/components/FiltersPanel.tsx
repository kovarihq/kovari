"use client";

import { Badge } from "@/shared/components/ui/badge";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Slider } from "@heroui/react";
import { Filter } from "lucide-react";

import { Filters } from "../types";

interface FiltersPanelProps {
  filters: Filters;
  onFilterChange: (key: string, value: any) => void;
  activeTab: number;
}

const INTEREST_OPTIONS = [
  "Solo Backpacking",
  "Weekend Getaways",
  "Long-Term Travel",
  "Workations",
  "Road Trips",
  "Train Journeys",
  "Himalayan Treks",
  "Camping & Stargazing",
  "River Rafting",
  "Skiing & Snow",
  "Wildlife & Safaris",
  "Beach Bumming",
  "Scuba & Snorkeling",
  "Island Hopping",
  "Street Food Crawls",
  "Local Markets",
  "Chai & Conversations",
  "Heritage & History",
  "Art & Galleries",
  "Music & Festivals",
  "Spiritual Travel",
  "Photography",
  "Aesthetic Spots",
  "Nightlife & Clubs"
];

const TRAVEL_STYLE_OPTIONS = [
  "Any",
  "Budget",
  "Mid-range",
  "Luxury",
  "Backpacker",
];

const GENDER_OPTIONS = ["Any", "Male", "Female", "Other"];
const PERSONALITY_OPTIONS = ["Any", "Extrovert", "Introvert", "Ambivert"];
const NATIONALITY_OPTIONS = [
  "Any",
  "Indian",
  "American",
  "British",
  "Canadian",
  "Australian",
  "German",
  "French",
  "Japanese",
  "Chinese",
  "Korean",
  "Singaporean",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malaysian",
  "Filipino",
  "Other",
];
const LANGUAGE_OPTIONS = [
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

export const FiltersPanel = ({
  filters,
  onFilterChange,
  activeTab,
}: FiltersPanelProps) => {
  return (
    <div className="pt-6 space-y-6">
      <h3 className="text-md font-semibold text-foreground flex items-center gap-2">
        {/* <Filter className="w-5 h-5" /> */}
        Additional Filters
      </h3>

      {/* 1. Age Range */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Age Range: {filters.ageRange[0]} - {filters.ageRange[1]}
        </Label>
        <Slider
          size="sm"
          step={1}
          minValue={18}
          maxValue={80}
          value={filters.ageRange}
          onChange={(value) =>
            onFilterChange(
              "ageRange",
              Array.isArray(value) ? value : [value, value],
            )
          }
          className="w-full"
          color="primary"
        />
      </div>

      {/* 2. Gender - Solo Only */}
      {activeTab === 0 && (
        <div className="space-y-2">
          <Label
            htmlFor="gender"
            className="text-sm font-medium text-foreground"
          >
            Gender Preference
          </Label>
          <Select
            value={filters.gender}
            onValueChange={(value) => onFilterChange("gender", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((gender) => (
                <SelectItem key={gender} value={gender}>
                  {gender}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 3. Personality - Solo Only */}
      {activeTab === 0 && (
        <div className="space-y-2">
          <Label
            htmlFor="personality"
            className="text-sm font-medium text-foreground"
          >
            Personality
          </Label>
          <Select
            value={filters.personality}
            onValueChange={(value) => onFilterChange("personality", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select personality" />
            </SelectTrigger>
            <SelectContent>
              {PERSONALITY_OPTIONS.map((personality) => (
                <SelectItem key={personality} value={personality}>
                  {personality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 8. Nationality */}
      {/* <div className="space-y-2">
        <Label
          htmlFor="nationality"
          className="text-sm font-medium text-foreground"
        >
          Nationality
        </Label>
        <Select
          value={filters.nationality}
          onValueChange={(value) => onFilterChange("nationality", value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select nationality" />
          </SelectTrigger>
          <SelectContent>
            {NATIONALITY_OPTIONS.map((nationality) => (
              <SelectItem key={nationality} value={nationality}>
                {nationality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div> */}

      {/* 4. Interests */}
      {/* <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Interests</Label>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((interest) => (
            <Badge
              key={interest}
              variant={
                filters.interests.includes(interest) ? "default" : "outline"
              }
              className="cursor-pointer rounded-full px-4 py-1.5 text-xs font-normal"
              onClick={() => {
                const newInterests = filters.interests.includes(interest)
                  ? filters.interests.filter((i) => i !== interest)
                  : [...filters.interests, interest];
                onFilterChange("interests", newInterests);
              }}
            >
              {interest}
            </Badge>
          ))}
        </div>
      </div> */}

      {/* 5. Languages */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Languages</Label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((language) => (
            <Badge
              key={language}
              variant={
                filters.languages.includes(language) ? "default" : "secondary"
              }
              className="cursor-pointer rounded-full px-4 py-1.5 text-xs font-normal"
              onClick={() => {
                const newLanguages = filters.languages.includes(language)
                  ? filters.languages.filter((l) => l !== language)
                  : [...filters.languages, language];
                onFilterChange("languages", newLanguages);
              }}
            >
              {language}
            </Badge>
          ))}
        </div>
      </div>

      {/* 6. Smoking Preference */}
      <div className="flex items-center justify-between p-4 border border-border rounded-xl">
        <div className="space-y-1">
          <Label
            htmlFor="smoking"
            className="text-sm font-medium text-foreground"
          >
            Smoking Preference
          </Label>
          <p className="text-xs text-muted-foreground">
            {filters.smoking === "Yes"
              ? "I'm okay with smoking"
              : "Strictly non-smoking"}
          </p>
        </div>
        <Switch
          id="smoking"
          checked={filters.smoking === "Yes"}
          onCheckedChange={(checked) =>
            onFilterChange("smoking", checked ? "Yes" : "No")
          }
          className="data-[state=checked]:bg-primary"
        />
      </div>

      {/* 7. Drinking Preference */}
      <div className="flex items-center justify-between p-4 border border-border rounded-xl">
        <div className="space-y-1">
          <Label
            htmlFor="drinking"
            className="text-sm font-medium text-foreground"
          >
            Drinking Preference
          </Label>
          <p className="text-xs text-muted-foreground">
            {filters.drinking === "Yes"
              ? "I'm okay with drinking"
              : "Strictly non-drinking"}
          </p>
        </div>
        <Switch
          id="drinking"
          checked={filters.drinking === "Yes"}
          onCheckedChange={(checked) =>
            onFilterChange("drinking", checked ? "Yes" : "No")
          }
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  );
};

