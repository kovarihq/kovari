"use client";

import React, { useEffect, useState, useRef } from "react";
import { UseFormReturn } from "react-hook-form";
import { Upload, Trash2, Loader2, User } from "lucide-react";
import {
  ProfileEditForm,
  profileEditSchema,
} from "@/features/profile/lib/types";
import SectionRow from "@/features/profile/components/section-row";
import { Button } from "@/shared/components/ui/button";
import { Avatar, Spinner } from "@heroui/react";
import { toast } from "sonner";
import ProfileCropModal from "@/shared/components/profile-crop-modal";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { COUNTRIES } from "@kovari/utils";
import EditSelectModal from "@/shared/components/ui/edit-select-modal";
import { useProfileFieldHandler } from "@/features/profile/hooks/use-profile-field-handler";
import { genderOptions } from "@/features/profile/lib/options";

interface GeneralSectionProps {
  form: UseFormReturn<ProfileEditForm>;
  isSubmitting: boolean;
  onSubmit: () => void;
  profileData: ProfileEditForm | null;
  isLoading: boolean;
  updateProfileField: (
    field: keyof ProfileEditForm,
    value: any
  ) => Promise<any>;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({
  form,
  profileData,
  isLoading,
  updateProfileField,
}) => {
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const [avatarDeleteLoading, setAvatarDeleteLoading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string>("");
  const [cropLoading, setCropLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Use the custom hook for standard field logic
  const {
    fieldErrors,
    setFieldError,
    validateField,
    handleSaveField: baseHandleSaveField,
  } = useProfileFieldHandler({ form, updateProfileField });

  // Async username uniqueness check matching ProfileSetupForm
  const checkUsernameUnique = async (username: string): Promise<boolean> => {
    setFieldError("username", "");
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
        setFieldError("username", "Username is already taken");
        return false;
      }
      return true;
    } catch (e) {
      setFieldError("username", "Could not check username");
      return false;
    } finally {
      setUsernameCheckLoading(false);
    }
  };

  const computeAge = (dobString: string) => {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  // Custom handleSaveField for username (with availability check)
  const handleSaveField = async (
    field: keyof ProfileEditForm,
    value: any
  ): Promise<boolean> => {
    setFieldError(field, "");
    
    // Validate the field
    const validationError = validateField(field, value);
    if (validationError) {
      setFieldError(field, validationError);
      return false;
    }

    // Special handling for username - check availability
    if (field === "username") {
      // Don't check if it's the same as the current username
      if (value !== profileData?.username) {
        const isAvailable = await checkUsernameUnique(value as string);
        if (!isAvailable) {
          return false;
        }
      }
    }

    // Special handling for birthday - update age as well
    if (field === "birthday") {
      const age = computeAge(value as string);
      // Update age in DB
      await updateProfileField("age", age);
      // Update age in form
      form.setValue("age", age);
    }

    // Use base handler for save
    return await baseHandleSaveField(field, value);
  };

  // Handle avatar upload - now shows crop modal instead of direct upload
  const handleAvatarUpload = async (file: File) => {
    // Validate file
    const maxSizeInMB = 4;
    const acceptedFormats = ["PNG", "JPG", "JPEG", "WEBP"];

    if (file.size > maxSizeInMB * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSizeInMB}MB`);
      return;
    }

    const fileExtension = file.name.split(".").pop()?.toUpperCase();
    if (!fileExtension || !acceptedFormats.includes(fileExtension)) {
      toast.error(`Only ${acceptedFormats.join(", ")} files are supported`);
      return;
    }

    // Create temporary URL for the crop modal
    const tempUrl = URL.createObjectURL(file);
    setTempImageUrl(tempUrl);
    setCropModalOpen(true);
  };

  // Handle crop completion
  const handleCropComplete = async (croppedImage: string | Blob) => {
    setCropLoading(true);
    try {
      let blob: Blob;
      if (typeof croppedImage === "string") {
        const response = await fetch(croppedImage);
        blob = await response.blob();
      } else {
        blob = croppedImage;
      }
      const file = new File([blob], "profile-crop.jpg", { type: "image/jpeg" });

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
      if (url) {
        // Update the avatar field
        await handleSaveField("avatar", url);
        toast.success("Profile photo updated successfully!");
        setCropModalOpen(false);
      } else {
        throw new Error("No URL returned from upload");
      }
    } catch (error) {
      console.error("Cropped image upload error:", error);
      toast.error("Failed to upload profile photo");
    } finally {
      setCropLoading(false);
      // Clean up temporary URL
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl("");
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleAvatarUpload(files[0]);
    }
    // Reset input value to allow selecting the same file again
    if (event.target) {
      event.target.value = "";
    }
  };

  // Handle avatar deletion
  const handleAvatarDelete = async () => {
    const currentAvatar = form.watch("avatar");
    console.log("Current avatar before deletion:", currentAvatar);

    if (!currentAvatar) {
      toast.error("No avatar to delete");
      return;
    }

    setAvatarDeleteLoading(true);
    try {
      console.log("Attempting to delete avatar...");

      // Update the avatar field to empty string
      await handleSaveField("avatar", "");

      console.log("Avatar deletion successful");
      toast.success("Avatar deleted successfully!");

      // Force refresh the form value to ensure UI updates
      form.setValue("avatar", "");
    } catch (error) {
      console.error("Avatar delete error:", error);
      toast.error("Failed to delete avatar");
    } finally {
      setAvatarDeleteLoading(false);
    }
  };

  // Handle upload button click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle crop modal close
  const handleCropModalClose = () => {
    setCropModalOpen(false);
    // Clean up temporary URL
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl("");
    }
  };

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-0" : "p-4"} space-y-6`}>
      {/* Header */}
      <div className="md:space-y-2 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="md:text-lg text-sm font-semibold text-foreground">
            Edit General Info
          </h1>
        </div>
        <p className="md:text-sm text-xs text-muted-foreground">
          Update your basic profile details.
        </p>
      </div>
      {/* Card Content */}
      <section
        className={`rounded-2xl bg-card ${isMobile ? "pt-2 border border-border shadow-none" : "border-none py-4 shadow-none"}`}
      >
        {/* Avatar & Buttons */}
        {isMobile ? (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-fit">
              <Avatar
                src={form.watch("avatar") || ""}
                className="h-28 w-28 mx-auto bg-secondary"
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
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                className="mt-6 bg-secondary border border-border shadow-none rounded-lg px-3 py-1 transition-all duration-300 disabled:opacity-50"
                aria-label="Upload avatar"
                onClick={handleUploadClick}
                disabled={avatarUploadLoading || avatarDeleteLoading}
              >
                {avatarUploadLoading ? (
                  <Spinner
                    variant="spinner"
                    size="sm"
                    classNames={{ spinnerBars: "bg-black" }}
                  />
                ) : (
                  <span className="text-xs text-primary">
                    Change profile picture
                  </span>
                )}
              </Button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Select avatar image"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1 pb-4 border-b-1 border-border">
            <Avatar
              src={form.watch("avatar") || ""}
              className="h-20 w-20 bg-secondary"
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
            />
            <Button
              size="sm"
              className="ml-auto bg-secondary border border-border rounded-lg px-3 py-1 transition-all duration-300 disabled:opacity-50"
              aria-label="Upload avatar"
              onClick={handleUploadClick}
              disabled={avatarUploadLoading}
            >
              {avatarUploadLoading ? (
                <Spinner
                  variant="spinner"
                  size="sm"
                  classNames={{ spinnerBars: "bg-black" }}
                />
              ) : (
                <span className="text-sm text-primary">
                  Change profile picture
                </span>
              )}
            </Button>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Select avatar image"
            />
          </div>
        )}
        <div className={isMobile ? "space-y-2 px-4 pb-4" : ""}>
          <SectionRow
            label="Name"
            value={form.watch("name") || "Not set"}
            onSave={(value) => handleSaveField("name", value as string)}
            fieldType="text"
            error={fieldErrors.name}
            placeholder="Enter your full name"
            maxLength={50}
            locked={!!profileData?.name}
          />
          <SectionRow
            label="Username"
            value={form.watch("username") || "Not set"}
            onSave={(value) => handleSaveField("username", (value as string).toLowerCase())}
            fieldType="text"
            error={fieldErrors.username}
            isChecking={usernameCheckLoading}
            placeholder="Enter your username"
            maxLength={32}
          />
          <SectionRow
            label="Birthday"
            value={
              form.watch("birthday")
                ? new Date(form.watch("birthday")).toLocaleDateString()
                : "Not set"
            }
            onSave={async (value) => {
              // Value is already a normalized ISO string from SectionRow
              if (value) {
                await handleSaveField("birthday", value as string);
              }
            }}
            fieldType="date"
            editValue={form.watch("birthday")}
            startYear={1950}
            endYear={new Date().getFullYear()}
            error={fieldErrors.birthday}
            placeholder="Select your birthday"
            locked={!!profileData?.birthday}
          />
          <SectionRow
            label="Gender"
            value={form.watch("gender") || "Not set"}
            onSave={(value) => handleSaveField("gender", value as string)}
            fieldType="select"
            selectOptions={genderOptions.map((opt) => ({
              value: opt,
              label: opt,
            }))}
            error={fieldErrors.gender}
            placeholder="Select gender"
            locked={!!profileData?.gender}
          />
          <SectionRow
            label="Nationality"
            value={
              form.watch("nationality") ? (
                <span className="text-sm font-medium text-muted-foreground">
                  {form.watch("nationality")}
                </span>
              ) : (
                "Not set"
              )
            }
            fieldType="popover-select"
            selectOptions={COUNTRIES.map(c => ({ value: c, label: c }))}
            onSave={(value) => handleSaveField("nationality", value as string)}
            editValue={form.watch("nationality")}
            placeholder="Search nationality..."
            error={fieldErrors.nationality}
            locked={!!profileData?.nationality}
          />
          <SectionRow
            label="Location"
            value={form.watch("location") || "Not set"}
            onSave={async (value, details) => {
              if (details) {
                 await handleSaveField("location_details", details);
              }
              await handleSaveField("location", value as string);
            }}
            fieldType="location"
            error={fieldErrors.location}
            placeholder="Enter your location"
          />
        </div>
      </section>

      {/* Profile Crop Modal */}
      <ProfileCropModal
        open={cropModalOpen}
        onOpenChange={handleCropModalClose}
        imageUrl={tempImageUrl}
        onCropComplete={handleCropComplete}
        isLoading={cropLoading}
      />
    </div>
  );
};

export default GeneralSection;

