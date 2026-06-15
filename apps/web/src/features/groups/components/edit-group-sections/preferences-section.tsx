"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Heart, Star } from "lucide-react";

interface PreferencesSectionProps {
  form: UseFormReturn<any>;
  onSubmit: (sectionId: string) => Promise<void>;
  isSubmitting: boolean;
}

const INTERESTS_OPTIONS = [
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

const TAG_OPTIONS = [
  "Backpackers",
  "Digital Nomads",
  "Solo Travelers",
  "Couples",
  "Families",
  "Students",
  "Professionals",
  "Adventure Seekers",
  "Culture Enthusiasts",
  "Food Lovers",
  "Photography",
  "Budget Travel",
  "Luxury Travel",
  "Eco-Friendly",
  "Accessible Travel",
];

export const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  form,
  onSubmit,
  isSubmitting,
}) => {
  const {
    setValue,
    watch,
    formState: { errors },
  } = form;

  const watchedValues = watch();

  const handleInterestToggle = (interest: string) => {
    const current = watchedValues.interests || [];
    const updated = current.includes(interest)
      ? current.filter((i: string) => i !== interest)
      : [...current, interest];
    setValue("interests", updated);
  };

  const handleTagToggle = (tag: string) => {
    const current = watchedValues.tags || [];
    const updated = current.includes(tag)
      ? current.filter((t: string) => t !== tag)
      : [...current, tag];
    setValue("tags", updated);
  };

  return (
    <>
      <div className="space-y-2 mb-6">
        <h1 className="text-md sm:text-lg font-semibold text-foreground">
          Travel Interests
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl">
          Select interests that match your group&apos;s travel style.
        </p>
      </div>
      <Card className="border-1 border-border bg-transparent mb-4">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Select Interests *</Label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS_OPTIONS.map((interest) => (
                <Badge
                  key={interest}
                  variant={
                    watchedValues.interests?.includes(interest)
                      ? "default"
                      : "outline"
                  }
                  className="cursor-pointer hover:bg-primary/80 text-xs px-2 py-1 font-medium"
                  onClick={() => handleInterestToggle(interest)}
                >
                  {interest}
                </Badge>
              ))}
            </div>
            {errors.interests && (
              <p className="text-xs text-destructive">
                {errors.interests.message?.toString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2 mb-6">
        <h1 className="text-md sm:text-lg font-semibold text-foreground">
          Group Tags
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl">
          Add tags to help others find your group.
        </p>
      </div>
      <Card className="border-1 border-border bg-transparent mb-4">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Select Tags</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((tag) => (
                <Badge
                  key={tag}
                  variant={
                    watchedValues.tags?.includes(tag) ? "default" : "outline"
                  }
                  className="cursor-pointer hover:bg-primary/80 text-xs px-2 py-1 font-medium"
                  onClick={() => handleTagToggle(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
            {errors.tags && (
              <p className="text-xs text-destructive">
                {errors.tags.message?.toString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        onClick={() => onSubmit("preferences")}
        disabled={isSubmitting}
        className="w-full h-9 text-sm"
      >
        {isSubmitting ? "Saving..." : "Save Preferences"}
      </Button>
    </>
  );
};

