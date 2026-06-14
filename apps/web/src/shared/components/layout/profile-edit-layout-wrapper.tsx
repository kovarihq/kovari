"use client";
import React, { useCallback, memo, useEffect } from "react";
import ProfileEditSidebar from "@/shared/components/layout/profile-edit-sidebar";
import { useProfileEditTabs } from "@/features/profile/hooks/use-profile-edit-tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  profileEditSchema,
  ProfileEditForm,
} from "@/features/profile/lib/types";
import { useProfileData } from "@/features/profile/hooks/use-profile-data";
import GeneralSection from "@/app/(app)/profile/edit/general/section";
import ProfessionalSection from "@/app/(app)/profile/edit/professional/section";
import PersonalSection from "@/app/(app)/profile/edit/personal/section";
import TravelSection from "@/app/(app)/profile/edit/travel/section";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import Link from "next/link";
import { useIsMobile } from "@/shared/hooks/use-mobile";

const DEFAULT_VALUES: ProfileEditForm = {
  avatar: "",
  name: "",
  username: "",
  age: 18,
  gender: "Prefer not to say",
  nationality: "",
  profession: "",
  interests: [],
  languages: [],
  bio: "",
  location: "",
  location_details: {},
  birthday: new Date().toISOString(),
  religion: "",
  smoking: "",
  drinking: "",
  personality: "",
  foodPreference: "",
  travel_intentions: [],
};

const SectionContent = memo(
  ({
    activeTab,
    form,
    isSubmitting,
    onSubmit,
    profileData,
    isLoading,
    updateProfileField,
  }: {
    activeTab: string;
    form: ReturnType<typeof useForm<ProfileEditForm>>;
    isSubmitting: boolean;
    onSubmit: () => void;
    profileData: ProfileEditForm | null;
    isLoading: boolean;
    updateProfileField: (
      field: keyof ProfileEditForm,
      value: string | number | string[],
    ) => Promise<any>;
  }) => {
    if (activeTab === "general") {
      return (
        <GeneralSection
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          profileData={profileData}
          isLoading={isLoading}
          updateProfileField={updateProfileField}
        />
      );
    }
    if (activeTab === "professional") {
      return (
        <ProfessionalSection
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          profileData={profileData}
          isLoading={isLoading}
          updateProfileField={updateProfileField}
        />
      );
    }
    if (activeTab === "personal") {
      return (
        <PersonalSection
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          profileData={profileData}
          isLoading={isLoading}
          updateProfileField={updateProfileField}
        />
      );
    }
    if (activeTab === "travel") {
      return (
        <TravelSection
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          profileData={profileData}
          isLoading={isLoading}
          updateProfileField={updateProfileField}
        />
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">Select a section to get started</p>
      </div>
    );
  },
);
SectionContent.displayName = "SectionContent";

export default function ProfileEditLayoutWrapper() {
  const { activeTab, setActiveTab } = useProfileEditTabs();
  const { profileData, isLoading, updateProfileField } = useProfileData();
  const router = useRouter();
  const form = useForm<ProfileEditForm>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isMobile = useIsMobile();

  // Update form with fetched data
  useEffect(() => {
    if (profileData) {
      Object.keys(profileData).forEach((key) => {
        form.setValue(
          key as keyof ProfileEditForm,
          profileData[key as keyof ProfileEditForm],
        );
      });
    }
  }, [profileData, form]);

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTab(key);
    },
    [setActiveTab],
  );

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // TODO: Implement API call to update profile info
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      // TODO: Error handling
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleBackToProfile = useCallback(() => {
    // Check if the user came from the profile page
    const referrer = document.referrer;
    const isFromProfile =
      referrer.includes("/profile") && !referrer.includes("/profile/edit");

    if (isFromProfile && window.history.length > 1) {
      // User came from profile page, go back
      router.back();
    } else {
      // User came from elsewhere or no history, redirect to profile
      router.replace("/profile");
    }
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen h-full bg-background text-foreground border-none rounded-none">
      {/* Breadcrumb */}
      <div className="px-1 py-2 md:px-4">
        <Link href={"/profile"}>
          <Button
            // onClick={handleBackToProfile}
            className="inline-flex items-center gap-1 text-xs md:text-sm bg-transparent text-foreground transition-colors"
          >
            <ChevronLeft className="md:h-4 md:w-4 h-3 w-3" />
            Back to Profile
          </Button>
        </Link>
      </div>

      {/* Main Content */}
      <div className={`flex flex-col md:flex-row min-h-[90vh] h-full bg-card text-foreground border-1 border-border rounded-3xl mx-3 mb-6 md:mx-6 ${isMobile ? "border-none" : ""}`}>
        {/* Sidebar (hide on mobile) */}
        {!isMobile && (
          <div className="w-full md:w-1/4 lg:w-1/5 md:border-r-1 border-border h-full flex flex-col self-stretch">
            <ProfileEditSidebar
              activeTab={activeTab}
              setActiveTab={handleTabChange}
            />
          </div>
        )}
        {/* Content Area */}
        <div className={`flex-1 flex flex-col md:p-3 md:px-6 gap-2 ${isMobile ? "bg-background rounded-3xl p-2 py-4" : ""}`}>
          {isMobile ? (
            <div className="flex flex-col gap-6">
              <GeneralSection
                form={form}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
                profileData={profileData}
                isLoading={isLoading}
                updateProfileField={updateProfileField}
              />
              <ProfessionalSection
                form={form}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
                profileData={profileData}
                isLoading={isLoading}
                updateProfileField={updateProfileField}
              />
              <PersonalSection
                form={form}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
                profileData={profileData}
                isLoading={isLoading}
                updateProfileField={updateProfileField}
              />
              <TravelSection
                form={form}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
                profileData={profileData}
                isLoading={isLoading}
                updateProfileField={updateProfileField}
              />
            </div>
          ) : (
            <SectionContent
              key={activeTab}
              activeTab={activeTab}
              form={form}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
              profileData={profileData}
              isLoading={isLoading}
              updateProfileField={updateProfileField}
            />
          )}
        </div>
      </div>
    </div>
  );
}

