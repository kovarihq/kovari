"use client";

import React from "react";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { Image, Spinner, User } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/shared/hooks/use-toast";
import { useSidebar } from "@/shared/components/ui/sidebar";
import { getFullImageUrl } from "@kovari/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useClerk } from "@clerk/nextjs";
import {
  Camera,
  Heart,
  Plus,
  Flag,
  Menu,
  Settings,
  LogOut,
  UserRound,
  ShieldCheck,
  MessageSquarePlus,
} from "lucide-react";
import ProfileImageModal from "./profile-image-modal";
import { AnimatePresence } from "framer-motion";
// import CreatePostModal from "./create-post-modal";
import { ReportDialog } from "@/shared/components/ReportDialog";
import { cn } from "@kovari/utils";
import { FeedbackDialog } from "@/features/feedback/components/FeedbackDialog";
import { useFeedback } from "@/features/feedback/hooks/useFeedback";
import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

export interface UserProfile {
  name: string;
  username: string;
  age: string;
  gender: string;
  nationality: string;
  profession: string;
  interests: string[];
  languages: string[];
  bio: string;
  followers: string;
  following: string;
  likes: string;
  coverImage: string;
  profileImage: string;
  posts: { id: number | string; image_url: string }[];
  isFollowing?: boolean;
  isOwnProfile?: boolean;
  hasActiveReport?: boolean;
  location: string;
  religion: string;
  smoking: string;
  drinking: string;
  personality: string;
  foodPreference: string;
  userId?: string;
}

export interface UserProfileProps {
  profile: UserProfile;
}

export const UserProfile: React.FC<UserProfileProps> = ({ profile }) => {
  const { open: feedbackOpen, setOpen: setFeedbackOpen } = useFeedback();
  // Dynamic posts array for the feed (now from profile)
  const [activeTab, setActiveTab] = React.useState("About");

  const [isFollowing, setIsFollowing] = React.useState(
    profile.isFollowing || false,
  );
  const [hasReported, setHasReported] = React.useState(
    profile.hasActiveReport || false,
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [followersCount, setFollowersCount] = React.useState(profile.followers);
  const { toast } = useToast();
  const router = useRouter();
  const { signOut } = useClerk();

  // Modal state for profile image (mobile only)
  const [isImageModalOpen, setIsImageModalOpen] = React.useState(false);
  const handleAvatarClick = () => {
    if (profile.profileImage) {
      setIsImageModalOpen(true);
    }
  };
  const handleAvatarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && profile.profileImage) {
      setIsImageModalOpen(true);
    }
  };
  const handleModalClose = () => setIsImageModalOpen(false);

  // Add state and handler for modal at the top of the component
  // const [isCreatePostModalOpen, setIsCreatePostModalOpen] =
  //   React.useState(false);
  // const handleOpenCreatePostModal = () => setIsCreatePostModalOpen(true);
  // const handleCloseCreatePostModal = () => setIsCreatePostModalOpen(false);

  // Report dialog state
  const [isReportDialogOpen, setIsReportDialogOpen] = React.useState(false);

  // const [posts, setPosts] = React.useState(profile.posts);

  // const handleCreatePost = async ({
  //   imageUrl,
  //   title,
  //   content,
  // }: {
  //   imageUrl: string;
  //   title: string;
  //   content?: string;
  // }) => {
  //   const res = await fetch("/api/user-posts", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ image_url: imageUrl, title, content }),
  //   });
  //   if (!res.ok) throw new Error("Failed to create post");
  //   const newPost = await res.json();
  //   setPosts((prev) => [newPost, ...prev]);
  // };

  // Debug logging
  console.log("Profile data:", {
    isFollowing: profile.isFollowing,
    isOwnProfile: profile.isOwnProfile,
    userId: profile.userId,
    followers: profile.followers,
  });

  // Additional debug logging for button visibility
  console.log("Button visibility check:", {
    isOwnProfile: profile.isOwnProfile,
    shouldShowOwnButtons: profile.isOwnProfile === true,
    shouldShowOtherButtons: profile.isOwnProfile === false,
  });

  // Sync isFollowing state with profile data
  React.useEffect(() => {
    console.log(
      "useEffect triggered - profile.isFollowing:",
      profile.isFollowing,
    );
    setIsFollowing(profile.isFollowing || false);
    setHasReported(profile.hasActiveReport || false);
    setFollowersCount(profile.followers);
  }, [profile.isFollowing, profile.followers, profile.hasActiveReport]);

  const handleFollowToggle = async () => {
    if (!profile.userId || profile.isOwnProfile) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/follow/${profile.userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setIsFollowing(data.action === "followed");

        // Update followers count
        const currentCount = parseInt(followersCount);
        if (data.action === "followed") {
          setFollowersCount(String(currentCount + 1));
          toast({
            title: "Success!",
            description: `You are now following ${profile.name}`,
          });
        } else {
          setFollowersCount(String(Math.max(0, currentCount - 1)));
          toast({
            title: "Unfollowed",
            description: `You have unfollowed ${profile.name}`,
          });
        }
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to update follow status",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error toggling follow status:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = (postId: string) => {
    // TODO: Implement save logic
    console.log("Save", postId);
  };

  const handleCopy = (postId: string) => {
    // TODO: Implement copy logic
    console.log("Copy", postId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      (event.target as HTMLButtonElement).click();
    }
  };

  const handleNavigateConnections = (
    tab: "followers" | "following" | "likes",
  ) => {
    if (!profile.userId) return;
    router.push(`/profile/${profile.userId}/connections?tab=${tab}`);
  };

  const handleKeyDownConnections = (
    event: React.KeyboardEvent<HTMLDivElement>,
    tab: "followers" | "following" | "likes",
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      handleNavigateConnections(tab);
    }
  };

  // Mobile/Tablet Layout Component
  const MobileLayout = () => (
    <div className="min-h-screen bg-transparent md:hidden">
      {!profile.isOwnProfile && (
        <MobileBackNav title={`@${profile.username}`} fallbackHref="/dashboard" />
      )}
      <Card className="w-full h-full mx-auto bg-transparent border-none rounded-none gap-3 shadow-none p-3">
        {/* Mobile Profile Header */}
        <Card className="rounded-none border-none shadow-none bg-transparent p-0">
          <CardContent className="p-0">
            <div className="flex flex-row items-stretch gap-4">
              {/* Profile Avatar Overlay - Stretches to match second card height */}
              {/* <Card className="w-[230px] h-[230px] aspect-square p-0 bg-transparent border-none shadow-none rounded-3xl flex overflow-hidden flex-shrink-0 items-stretch">
                <div className="w-full h-full">
                  <Image
                    src={
                      profile.profileImage ||
                      "https://images.pexels.com/photos/17071640/pexels-photo-17071640.jpeg"
                    }
                    alt="Profile"
                    className="w-full h-full object-cover rounded-3xl"
                  />
                </div>
              </Card> */}

              <Card className="flex flex-col rounded-3xl bg-card border border-border shadow-none p-4 gap-0 items-start justify-start flex-1 min-w-0">
                {/* Left Info */}
                {/* Left Info */}
                <div className="flex flex-row items-center justify-between w-full mb-2">
                  <div className="flex flex-row justify-start items-center flex-1 min-w-0 gap-x-3">
                    <div
                      className="flex flex-col cursor-pointer focus:outline-none"
                      tabIndex={0}
                      aria-label="View profile image"
                      onClick={handleAvatarClick}
                      onKeyDown={handleAvatarKeyDown}
                      role="button"
                    >
                      {profile.profileImage ? (
                        <Avatar className="h-[70px] w-[70px] border border-border">
                          <AvatarImage src={profile.profileImage || ""} />
                          <UserAvatarFallback
                            className="h-[70px] w-[70px]"
                            iconClassName="w-8 h-8"
                          />
                        </Avatar>
                      ) : (
                        <Avatar className="h-[70px] w-[70px] border border-border">
                          <UserAvatarFallback
                            className="h-[70px] w-[70px]"
                            iconClassName="w-8 h-8"
                          />
                        </Avatar>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h1 className="text-sm font-semibold text-foreground leading-tight">
                          {profile.name}
                        </h1>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        @
                        {profile.username.length > 30
                          ? `${profile.username.substring(0, 30)}...`
                          : profile.username}
                      </p>
                      <div className="flex flex-row items-center gap-x-6 w-full mt-2">
                        <div className="flex flex-row gap-4 items-center flex-shrink-0">
                          {/* Followers - clickable only on own profile */}
                          <div
                            className={`text-left flex flex-row justify-start items-center gap-1 focus:outline-none ${profile.isOwnProfile ? "cursor-pointer" : "cursor-default"}`}
                            {...(profile.isOwnProfile && {
                              tabIndex: 0,
                              role: "button",
                              "aria-label": "View followers",
                              onClick: () =>
                                handleNavigateConnections("followers"),
                              onKeyDown: (
                                e: React.KeyboardEvent<HTMLDivElement>,
                              ) => handleKeyDownConnections(e, "followers"),
                            })}
                          >
                            <div className="text-xs font-semibold text-foreground">
                              {followersCount}
                            </div>
                            <span className="text-xs text-foreground font-semibold">
                              Followers
                            </span>
                          </div>
                          {/* Following - clickable only on own profile */}
                          <div
                            className={`text-left flex flex-row justify-start items-center gap-1 focus:outline-none ${profile.isOwnProfile ? "cursor-pointer" : "cursor-default"}`}
                            {...(profile.isOwnProfile && {
                              tabIndex: 0,
                              role: "button",
                              "aria-label": "View following",
                              onClick: () =>
                                handleNavigateConnections("following"),
                              onKeyDown: (
                                e: React.KeyboardEvent<HTMLDivElement>,
                              ) => handleKeyDownConnections(e, "following"),
                            })}
                          >
                            <div className="text-xs font-semibold text-foreground">
                              {profile.following}
                            </div>
                            <span className="text-xs text-foreground font-semibold">
                              Following
                            </span>
                          </div>
                          {/* <div
                            className="text-left flex flex-row justify-start items-center gap-1 cursor-pointer focus:outline-none"
                            tabIndex={0}
                            role="button"
                            aria-label="View Likes"
                            onClick={() => handleNavigateConnections("likes")}
                            onKeyDown={(e) =>
                              handleKeyDownConnections(e, "likes")
                            }
                          >
                            <div className="text-xs font-semibold text-foreground">
                              {profile.likes}
                            </div>
                            <span className="text-xs text-foreground font-bold">
                              Likes
                            </span>
                          </div> */}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Settings/Logout Menu */}
                  {profile.isOwnProfile && (
                    <div className="self-start">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            className="h-8 w-8 -mr-2 bg-transparent hover:bg-transparent focus:ring-0 focus:outline-none text-foreground hover:text-foreground focus-visible:border-none focus-visible:outline-none
                            focus-visible:ring-0"
                          >
                            <Menu className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 bg-background/95 backdrop-blur-2xl rounded-2xl border-border"
                        >
                          <DropdownMenuItem
                            onClick={() => router.push("/settings")}
                            className="px-2 cursor-pointer hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none focus-within:!text-foreground"
                          >
                            <Settings className="mr-1 h-4 w-4" />
                            <span>Settings</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              // We don't have a state for Dropdown open in this particular usage, it closes automatically on click usually, or we can just open feedback
                              setFeedbackOpen(true);
                            }}
                            className="px-2 cursor-pointer hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none focus-within:!text-foreground"
                          >
                            <MessageSquarePlus className="mr-1 h-4 w-4" />
                            <span>Feedback</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => router.push("/safety")}
                            className="px-2 cursor-pointer hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none focus-within:!text-foreground"
                          >
                            <ShieldCheck className="mr-1 h-4 w-4" />
                            <span>Safety</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              await signOut({ redirectUrl: "/sign-in" });
                              router.push("/sign-in");
                            }}
                            className="px-2 cursor-pointer text-destructive focus:text-destructive hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none focus-within:!text-destructive"
                          >
                            <LogOut className="mr-1 h-4 w-4 text-destructive" />
                            <span>Log out</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>

                {/* <div className="flex flex-row items-center gap-x-6 w-full min-[376px]:hidden">
                  <div className="flex flex-row justify-start items-center flex-1 min-w-0 gap-x-4">
                    <div className="flex flex-col">
                      <Avatar className="h-[70px] w-[70px]">
                        <AvatarImage src={profile.profileImage || ""} />
                        <UserAvatarFallback className="h-[70px] w-[70px]" iconClassName="w-8 h-8" />
                      </Avatar>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h1 className="text-sm font-semibold text-foreground leading-tight">
                          {profile.name}
                        </h1>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        @{profile.username}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row items-center gap-x-6 w-full mt-3 mb-2 min-[376px]:hidden">
                  <div className="flex flex-row gap-6 items-center flex-shrink-0">
                    <div className="text-left flex flex-row justify-start items-center gap-1">
                      <div className="text-xs font-semibold text-foreground">
                        {followersCount}
                      </div>
                      <span className="text-xs text-foreground font-bold">
                        Followers
                      </span>
                    </div>
                    <div className="text-left flex flex-row justify-start items-center gap-1">
                      <div className="text-xs font-semibold text-foreground">
                        {profile.following}
                      </div>
                      <span className="text-xs text-foreground font-bold">
                        Following
                      </span>
                    </div>
                    <div className="text-left flex flex-row justify-start items-center gap-1">
                      <div className="text-xs font-semibold text-foreground">
                        {profile.likes}
                      </div>
                      <span className="text-xs text-foreground font-bold">
                        Likes
                      </span>
                    </div>
                  </div>
                </div> */}

                {/* Profession */}
                {/* <div className="text-xs  text-muted-foreground font-medium mt-1">
                  {profile.profession}
                </div> */}
                <div className="text-xs  text-muted-foreground font-medium mt-1 line-clamp-3">
                  {profile.bio || "No bio added."}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-row flex-wrap gap-1.5 mt-4">
                  {profile.isOwnProfile === true ? (
                    // Own profile buttons
                    <>
                      <Link href="/profile/edit">
                        <Button
                          size={"sm"}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg px-6 py-1 text-xs shadow-none focus:ring-0 focus:outline-none"
                        >
                          Edit Profile
                        </Button>
                      </Link>
                      <Link href="/explore">
                        <Button
                          variant={"secondary"}
                          size={"sm"}
                          className="font-semibold rounded-lg px-6 py-1 text-xs shadow-none focus:ring-0 focus:outline-none"
                        >
                          Explore
                        </Button>
                      </Link>
                      {/* {profile.isOwnProfile === true && (
                        <Button
                          variant={"secondary"}
                          size={"sm"}
                          className="font-semibold rounded-lg px-6 py-1 text-xs shadow-none focus:ring-0 focus:outline-none"
                          aria-label="Create post"
                          tabIndex={0}
                          onClick={handleOpenCreatePostModal}
                        >
                          <span className="hidden [@media(min-width:425px)]:inline">
                            Create post
                          </span>
                          <span className="inline [@media(min-width:425px)]:hidden">
                            <Plus className="w-4 h-4" />
                          </span>
                        </Button>
                      )} */}
                    </>
                  ) : (
                    // Other user's profile buttons
                    <>
                      <Button
                        size={"sm"}
                        onClick={handleFollowToggle}
                        disabled={isLoading}
                        className={`font-semibold rounded-lg px-6 py-1 text-xs shadow-none focus:ring-0 focus:outline-none ${
                          isFollowing
                            ? "bg-secondary text-foreground"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <Spinner
                              variant="spinner"
                              size="sm"
                              color={isFollowing ? "default" : "secondary"}
                              classNames={{
                                spinnerBars: isFollowing ? "bg-black" : "",
                              }}
                            />
                          </div>
                        ) : isFollowing ? (
                          "Unfollow"
                        ) : (
                          "Follow"
                        )}
                      </Button>
                      <Link
                        href={
                          profile.userId ? `/chat/${profile.userId}` : "/chat"
                        }
                      >
                        <Button
                          size={"sm"}
                          className="bg-secondary text-foreground font-semibold rounded-lg px-6 py-1 text-xs shadow-none focus:ring-0 focus:outline-none"
                          aria-label="Message user"
                          tabIndex={0}
                        >
                          Message
                        </Button>
                      </Link>
                      <Button
                        size={"sm"}
                        onClick={() => setIsReportDialogOpen(true)}
                        className={cn(
                          "font-semibold rounded-lg sm:px-6 px-4 py-1 text-xs shadow-none focus:ring-0 focus:outline-none",
                          hasReported 
                            ? "bg-secondary text-foreground cursor-not-allowed pointer-events-none" 
                            : "text-destructive hover:text-destructive bg-secondary"
                        )}
                        aria-label={hasReported ? "User reported" : "Report user"}
                        tabIndex={0}
                      >
                        <span className="">{hasReported ? "Reported" : "Report"}</span>
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Mobile Content Card */}
        <Card
          aria-label="User details"
          className="w-full h-full min-h-[80vh] rounded-3xl bg-card shadow-none p-4 flex flex-col gap-6 border border-border mx-auto"
        >
          {/* Tabs Navigation - Mobile Style */}
          <div className="flex gap-x-2 sm:gap-x-4">
            {[
              // { key: "Posts", label: "Posts" },
              { key: "About", label: "About" },
            ].map((tab) => (
              <Button
                key={tab.key}
                type="button"
                aria-label={`${tab.label} tab`}
                tabIndex={0}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActiveTab(tab.key);
                }}
                className={
                  `bg-transparent hover:bg-transparent relative pb-2 transition-colors duration-150 text-base focus:outline-none ` +
                  (activeTab === tab.key
                    ? "font-bold text-primary"
                    : "font-bold text-foreground hover:text-black")
                }
                style={{ outline: "none" }}
              >
                <span className="align-middle text-xs sm:text-sm">
                  {tab.label}
                </span>
                {activeTab === tab.key && (
                  <span className="absolute left-0 -bottom-[1px] w-full h-0.5 bg-primary rounded" />
                )}
              </Button>
            ))}
          </div>

          <CardContent className="p-0">
            {activeTab === "About" && (
              <div className="flex flex-col gap-6">
                <div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Age
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.age || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Gender
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.gender || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Nationality
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.nationality || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Location
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.location || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Profession
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.profession || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Religion
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.religion || "Not specified"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <Separator />
                <div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Personality
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.personality || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Food Preference
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.foodPreference || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Smoking
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.smoking || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                        Drinking
                      </dt>
                      <dd className="text-xs text-foreground font-medium mt-0.5">
                        {profile.drinking || "Not specified"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <Separator />
                <div className="flex flex-col gap-4">
                  <div className="flex-1">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                      Interests
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests && profile.interests.length > 0 ? (
                        profile.interests.map((interest) => (
                          <Badge
                            key={interest}
                            className="rounded-full px-3 py-1 text-xs font-medium bg-secondary text-foreground"
                          >
                            {interest}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs font-medium text-foreground">
                          Not specified
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                      Languages
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.languages && profile.languages.length > 0 ? (
                        profile.languages.map((language) => (
                          <Badge
                            key={language}
                            className="rounded-full px-3 py-1 text-xs font-medium bg-secondary text-foreground"
                          >
                            {language}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs font-medium text-foreground">
                          Not specified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* {activeTab === "Posts" && (
              <div>
                {posts.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="relative group aspect-[4/5] bg-muted rounded-none overflow-hidden flex items-center justify-center shadow-sm"
                      >
                        <Image
                          src={post.image_url}
                          alt={`Post ${post.id}`}
                          className="w-full h-full object-cover rounded-none"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center mb-2">
                      <Camera className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      No posts yet
                    </h3>
                    {profile.isOwnProfile === true && (
                      <Button
                        className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold focus:outline-none focus:ring-0"
                        aria-label="Create your first post"
                        tabIndex={0}
                        onClick={handleOpenCreatePostModal}
                      >
                        Create your first post
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )} */}
          </CardContent>
        </Card>
      </Card>
      {/* Modal for profile image (mobile only) */}
      <AnimatePresence>
        {isImageModalOpen && (
          <ProfileImageModal
            src={profile.profileImage || ""}
            onClose={handleModalClose}
          />
        )}
      </AnimatePresence>
      {/* Modal for creating post */}
      {/* <CreatePostModal
        open={isCreatePostModalOpen}
        onClose={handleCloseCreatePostModal}
        onCreate={handleCreatePost}
      /> */}
    </div>
  );

  // Desktop Layout Component
  const DesktopLayout = () => (
    <div className="min-h-screen bg-transparent hidden md:block">
      <Card className="w-full h-full mx-auto bg-transparent border-none rounded-none gap-4 shadow-none p-5">
        {/* Profile Information Section */}
        <Card className="rounded-none border-none shadow-none bg-transparent p-0">
          <CardContent className="p-0">
            <div className="flex flex-row items-stretch gap-4">
              {/* Profile Avatar Overlay - Stretches to match second card height */}
              <Card className="w-[200px] h-[200px] min-[840px]:h-[180px] min-[840px]:w-[180px] p-0 bg-muted border-none shadow-none rounded-3xl overflow-hidden flex-shrink-0">
                {profile.profileImage ? (
                  <img
                    src={getFullImageUrl(profile.profileImage)}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-3xl border border-border"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary rounded-3xl border border-border">
                    <svg
                      className="w-20 h-20 text-gray-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <rect x="4" y="14" width="16" height="6" rx="3" />
                    </svg>
                    {/* <UserRound className="w-20 h-20 text-gray-400" /> */}
                  </div>
                )}
              </Card>

              <Card className="flex flex-col rounded-3xl bg-card border border-border shadow-none p-6 py-5 gap-0 items-start justify-start flex-1 min-w-0">
                {/* Left Info */}
                <div className="flex flex-row items-center gap-x-10 w-full">
                  <div className="flex flex-col flex-1 min-w-0 gap-x-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-lg font-semibold text-foreground leading-tight">
                        {profile.name}
                      </h1>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium mb-2">
                      @
                      {profile.username.length > 30
                        ? `${profile.username.substring(0, 30)}...`
                        : profile.username}
                    </p>
                  </div>
                  <div className="flex flex-row gap-10 items-center flex-shrink-0">
                    {/* Followers - clickable only on own profile */}
                    <div
                      className={`text-left focus:outline-none ${profile.isOwnProfile ? "cursor-pointer" : "cursor-default"}`}
                      {...(profile.isOwnProfile && {
                        tabIndex: 0,
                        role: "button",
                        "aria-label": "View followers",
                        onClick: () => handleNavigateConnections("followers"),
                        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) =>
                          handleKeyDownConnections(e, "followers"),
                      })}
                    >
                      <div className="text-xs text-muted-foreground mb-0.5 font-medium">
                        Followers
                      </div>
                      <div className="text-md font-semibold text-foreground">
                        {followersCount}
                      </div>
                    </div>
                    {/* Following - clickable only on own profile */}
                    <div
                      className={`text-left focus:outline-none ${profile.isOwnProfile ? "cursor-pointer" : "cursor-default"}`}
                      {...(profile.isOwnProfile && {
                        tabIndex: 0,
                        role: "button",
                        "aria-label": "View following",
                        onClick: () => handleNavigateConnections("following"),
                        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) =>
                          handleKeyDownConnections(e, "following"),
                      })}
                    >
                      <div className="text-xs text-muted-foreground mb-0.5 font-medium">
                        Following
                      </div>
                      <div className="text-md font-semibold text-foreground">
                        {profile.following}
                      </div>
                    </div>
                    {/* <div
                      className="text-left cursor-pointer focus:outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label="View Likes"
                      onClick={() => handleNavigateConnections("likes")}
                      onKeyDown={(e) => handleKeyDownConnections(e, "likes")}
                    >
                      <div className="text-xs text-muted-foreground mb-0.5 font-medium">
                        Likes
                      </div>
                      <div className="text-md font-semibold text-foreground">
                        {profile.likes}
                      </div>
                    </div> */}
                  </div>
                </div>
                {/* Profession */}
                {/* <div className="text-sm text-muted-foreground font-medium mt-1">
                  {profile.profession}
                </div> */}
                <div className="text-sm text-muted-foreground font-medium mt-1 line-clamp-3">
                  {profile.bio || "No bio added."}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-row flex-wrap gap-1.5 mt-4">
                  {profile.isOwnProfile === true ? (
                    // Own profile buttons
                    <>
                      <Link href="/profile/edit">
                        <Button
                          size={"sm"}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none"
                        >
                          Edit Profile
                        </Button>
                      </Link>
                      <Link href="/explore">
                        <Button
                          size={"sm"}
                          variant={"secondary"}
                          className="font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none"
                        >
                          Explore
                        </Button>
                      </Link>
                      {/* {profile.isOwnProfile === true && (
                        <Button
                          variant={"secondary"}
                          size={"sm"}
                          className="font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none"
                          aria-label="Create post"
                          tabIndex={0}
                          onClick={handleOpenCreatePostModal}
                        >
                          Create post
                        </Button>
                      )} */}
                    </>
                  ) : (
                    // Other user's profile buttons
                    <>
                      <Button
                        size={"sm"}
                        onClick={handleFollowToggle}
                        disabled={isLoading}
                        className={`font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none ${
                          isFollowing
                            ? "bg-secondary text-foreground"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <Spinner
                              variant="spinner"
                              size="sm"
                              color={isFollowing ? "default" : "secondary"}
                              classNames={{
                                spinnerBars: isFollowing ? "bg-black" : "",
                              }}
                            />
                          </div>
                        ) : isFollowing ? (
                          "Unfollow"
                        ) : (
                          "Follow"
                        )}
                      </Button>
                      <Link
                        href={
                          profile.userId ? `/chat/${profile.userId}` : "/chat"
                        }
                      >
                        <Button
                          size={"sm"}
                          className="bg-secondary text-foreground font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none"
                          aria-label="Message user"
                          tabIndex={0}
                        >
                          Message
                        </Button>
                      </Link>
                      <Button
                        size={"sm"}
                        onClick={() => setIsReportDialogOpen(true)}
                        className={cn(
                          "font-semibold rounded-lg px-6 py-1 text-sm shadow-none focus:ring-0 focus:outline-none",
                          hasReported 
                            ? "bg-secondary text-foreground cursor-not-allowed pointer-events-none" 
                            : "text-destructive hover:text-destructive bg-secondary"
                        )}
                        aria-label={hasReported ? "User reported" : "Report user"}
                        tabIndex={0}
                      >
                        {hasReported ? "Reported" : "Report"}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card
          aria-label="User details"
          className="w-full h-full rounded-3xl bg-card shadow-none p-6 flex flex-col gap-6 border border-border mx-auto"
        >
          {/* Tabs Navigation - Modern Style */}
          <div className="flex gap-x-2">
            {[
              // { key: "Posts", label: "Posts" },
              { key: "About", label: "About" },
            ].map((tab) => (
              <Button
                key={tab.key}
                type="button"
                aria-label={`${tab.label} tab`}
                tabIndex={0}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActiveTab(tab.key);
                }}
                className={
                  `bg-transparent hover:bg-transparent relative pb-2 transition-colors duration-150 text-base focus:outline-none ` +
                  (activeTab === tab.key
                    ? "font-bold text-primary"
                    : "font-bold text-foreground hover:text-black")
                }
                style={{ outline: "none" }}
              >
                <span className="align-middle text-sm">{tab.label}</span>
                {activeTab === tab.key && (
                  <span className="absolute left-0 -bottom-[1px] w-full px-6 h-0.5 bg-primary rounded" />
                )}
              </Button>
            ))}
          </div>

          <CardContent className="p-0">
            {activeTab === "About" && (
              <div className="space-y-8">
                <div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Age
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.age || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Gender
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.gender || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Nationality
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.nationality || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Profession
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.profession || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Location
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.location || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Religion
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.religion || "Not specified"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <Separator />

                <div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Personality
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.personality || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Food Preference
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.foodPreference || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Smoking
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.smoking || "Not specified"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                        Drinking
                      </dt>
                      <dd className="text-sm text-foreground font-medium">
                        {profile.drinking || "Not specified"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <Separator />
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                      Interests
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests && profile.interests.length > 0 ? (
                        profile.interests.map((interest) => (
                          <Badge
                            key={interest}
                            className="rounded-full px-3 py-1 text-sm font-medium bg-secondary text-foreground"
                          >
                            {interest}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm font-medium text-foreground">
                          Not specified
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                      Languages
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.languages && profile.languages.length > 0 ? (
                        profile.languages.map((language) => (
                          <Badge
                            key={language}
                            className="rounded-full px-3 py-1 text-sm font-medium bg-secondary text-foreground"
                          >
                            {language}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm font-medium text-foreground">
                          Not specified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* {activeTab === "Posts" && (
              <div>
                {posts.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="relative group aspect-[4/5] bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-sm"
                      >
                        <Image
                          src={post.image_url}
                          alt={`Post ${post.id}`}
                          className="w-full h-full object-cover"
                        />
                        <div
                          className="absolute bottom-0 left-0 w-full h-20 z-10 flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          aria-label="Post actions"
                        >
                          <div className="flex gap-2 bg-transparent rounded-2xl border-none shadow-none px-4 py-6 h-full w-full justify-center bg-gradient-to-t from-black/30 to-transparent">
                            <Button
                              className="px-6 py-1 w-1/2 rounded-full bg-white/80 text-foreground font-semibold shadow-md backdrop-blur-sm focus:outline-none focus:ring-0"
                              tabIndex={0}
                              aria-label="View post"
                              onKeyDown={handleKeyDown}
                            >
                              View Post
                            </Button>
                            <Button
                              className="px-6 py-1 w-1/2 rounded-full bg-white/80 text-foreground font-semibold shadow-md backdrop-blur-sm focus:outline-none focus:ring-0"
                              tabIndex={0}
                              aria-label="Share post"
                              onKeyDown={handleKeyDown}
                            >
                              Share
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                      <Camera className="text-foreground" />
                    </div>
                    <h3 className="text-md font-semibold text-foreground mb-1">
                      No posts yet
                    </h3>
                    {profile.isOwnProfile === true && (
                      <Button
                        className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold focus:outline-none focus:ring-0"
                        aria-label="Create your first post"
                        tabIndex={0}
                        onClick={handleOpenCreatePostModal}
                      >
                        Create your first post
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )} */}
          </CardContent>
        </Card>
      </Card>
    </div>
  );

  return (
    <>
      <MobileLayout />
      <DesktopLayout />
      {/* <CreatePostModal
        open={isCreatePostModalOpen}
        onClose={handleCloseCreatePostModal}
        onCreate={handleCreatePost}
      /> */}
      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        targetType="user"
        targetId={profile.userId || ""}
        targetName={profile.name}
        onSuccess={() => setHasReported(true)}
      />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
};

