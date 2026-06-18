"use client";

import React, { useEffect, useState } from "react";
import { UserProfile } from "@/features/profile/components/user-profile";
import type { UserProfile as UserProfileType } from "@/features/profile/components/user-profile";
import { useUser } from "@clerk/nextjs";
import { CardContent } from "@/shared/components/ui/card";
import { Card, Skeleton } from "@heroui/react";
import { Button } from "@/shared/components/ui/button";

// Loading component specific to profile page
const ProfileLoading = () => {
  return (
    <>
      {/* Mobile/Tablet Layout */}
      <div className="min-h-screen bg-background md:hidden">
        <Card className="w-full mx-auto bg-transparent border-none rounded-none gap-3 shadow-none p-3">
          {/* Profile Information Section */}
          <Card className="rounded-none border-none shadow-none bg-transparent p-0">
            <CardContent className="p-0">
              <div className="flex flex-row items-stretch gap-4">
                <Card className="flex rounded-3xl bg-card border border-border shadow-none p-4 items-start justify-start flex-1 min-w-0">
                  <div className="flex flex-row items-center gap-x-6 w-full mb-4 mt-3">
                    <div className="flex flex-row justify-start items-center flex-1 min-w-0 gap-x-4">
                      <div className="flex flex-col">
                        <Skeleton className="h-[70px] w-[70px] rounded-full" />
                      </div>
                      <div className="flex flex-col">
                        <Skeleton className="h-3 w-24 rounded-full mb-2" />
                        <Skeleton className="h-3 w-20 rounded-full mb-2" />
                      </div>
                    </div>
                  </div>

                  <Skeleton className="h-3 w-1/2 rounded-full mb-2" />
                  <Skeleton className="h-3 w-full rounded-full mb-2" />

                  <div className="flex flex-row justify-start items-center flex-1 gap-x-1.5 mt-4 w-full">
                    <Skeleton className="h-8 w-1/2 rounded-lg" />
                    <Skeleton className="h-8 w-1/2 rounded-lg" />
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card
            aria-label="User details"
            className="w-full rounded-3xl bg-card shadow-none p-4 flex flex-col gap-6 border border-border mx-auto"
          >
            <Skeleton className="w-1/5 rounded-full h-3 mt-2 mb-1"></Skeleton>

            <Card className="rounded-none border-none shadow-none bg-transparent p-0">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 9 }).map((post, index) => (
                    <div
                      key={index}
                      className="aspect-[4/5] bg-muted rounded-none overflow-hidden flex items-center justify-center shadow-sm"
                    >
                      <Skeleton className="w-full h-full object-cover rounded-none"></Skeleton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Card>
        </Card>
      </div>

      {/* Desktop Layout */}
      <div className="min-h-screen bg-background hidden md:block">
        <Card className="w-full mx-auto bg-transparent border-none rounded-none gap-4 shadow-none p-5">
          {/* Profile Information Section */}
          <Card className="rounded-none border-none shadow-none p-0 bg-transparent">
            <CardContent className="p-0">
              <div className="flex flex-row items-stretch gap-4">
                {/* Profile Avatar Overlay - Stretches to match second card height */}
                <Skeleton className="rounded-3xl w-[200px] h-[200px] min-[840px]:h-[180px] min-[840px]:w-[180px] flex-shrink-0"></Skeleton>

                <Card className="flex rounded-3xl bg-card border border-border h-[200px] min-[840px]:h-[180px] shadow-none p-6 py-5 items-start justify-start flex-1 min-w-0">
                  <Skeleton className="h-4 w-1/5 rounded-full mb-2 mt-6" />
                  <Skeleton className="h-4 w-1/6 rounded-full mb-5" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                  <Skeleton className="h-4 w-full rounded-full mb-2" />
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card
            aria-label="User details"
            className="w-full rounded-3xl bg-card shadow-none p-6 flex flex-col gap-6 border border-border mx-auto"
          >
            <Skeleton className="w-1/6 rounded-full h-4 mt-2 mb-1"></Skeleton>

            <Card className="rounded-none border-none shadow-none bg-transparent p-0">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((post, index) => (
                    <div
                      key={index}
                      className="aspect-[4/5] bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-sm"
                    >
                      <Skeleton className="w-full h-full object-cover"></Skeleton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Card>
        </Card>
      </div>
    </>
  );
};

export default function ProfilePage() {
  const { isLoaded, isSignedIn } = useUser();
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/profile/current");
      if (!res.ok) {
        throw new Error("Failed to load profile from server.");
      }
      const json = await res.json();
      const data = json?.data;
      if (!data) {
        throw new Error("Profile data not found in response.");
      }

      // Map to UserProfileType expected by UserProfile component
      const mappedProfile: UserProfileType = {
        name: data.name || "",
        username: data.username || "",
        age: data.age ? String(data.age) : "",
        gender: data.gender || "",
        nationality: data.nationality || "",
        profession: data.profession || "",
        interests: Array.isArray(data.interests) ? data.interests : [],
        languages: Array.isArray(data.languages) ? data.languages : [],
        bio: data.bio || "",
        followers: String(data.followers ?? 0),
        following: String(data.following ?? 0),
        likes: "0",
        coverImage: "",
        profileImage: data.avatar || "",
        posts: [],
        isFollowing: false,
        isOwnProfile: true,
        location: data.location || "Surat",
        religion: data.religion || "Hindu",
        smoking: data.smoking || "No",
        drinking: data.drinking || "No",
        personality: data.personality || "Ambivert",
        foodPreference: data.foodPreference || "Veg",
        userId: data.id,
      };

      setProfile(mappedProfile);
    } catch (err: any) {
      console.error("[ERROR] ProfilePage fetch:", err);
      setError(err?.message || "Unable to load your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchProfile();
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return <ProfileLoading />;
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <h2 className="text-2xl font-semibold mb-2">Profile Not Found</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          {error || "Unable to load your profile. Please try again."}
        </p>
        <Button 
          onClick={fetchProfile}
          className="bg-primary text-primary-foreground font-semibold px-6 py-2 rounded-lg"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return <UserProfile profile={profile} />;
}
