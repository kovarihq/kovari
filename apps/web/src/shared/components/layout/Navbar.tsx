"use client";

import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  DropdownItem,
  DropdownTrigger,
  Dropdown,
  // DropdownMenu,
  Avatar,
  Skeleton,
} from "@heroui/react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { Button } from "@/shared/components/ui/button";
import { Compass, MessageCircle, Shield } from "lucide-react";
import Spinner from "../Spinner";
import { createClient } from "@kovari/api/client";
import MobileMenuOverlay from "./MobileMenuOverlay";
import { motion } from "framer-motion";
import WaitlistModal from "../landing/WaitlistModal";
import { trackEvent } from "@kovari/utils";
import { getProductionAppUrl } from "@/lib/config/site";

export const AcmeLogo = () => {
  return (
    <svg fill="none" height="40" viewBox="0 0 32 32" width="40">
      <path
        clipRule="evenodd"
        d="M17.6482 10.1305L15.8785 7.02583L7.02979 22.5499H10.5278L17.6482 10.1305ZM19.8798 14.0457L18.11 17.1983L19.394 19.4511H16.8453L15.1056 22.5499H24.7272L19.8798 14.0457Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
};

export default function App({
  onAvatarMenuOpenChange,
}: {
  onAvatarMenuOpenChange?: (isOpen: boolean) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [profilePhotoLoading, setProfilePhotoLoading] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    // Hide spinner when route changes
    setIsNavigating(false);
  }, [pathname]);

  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!user?.id) return;
      setProfilePhotoLoading(true);
      setProfilePhotoError(null);
      try {
        const supabase = createClient();
        // First, get the user's row in the users table by clerk_user_id
        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select("id, is_internal")
          .eq("clerk_user_id", user.id)
          .maybeSingle();
        if (userError) throw userError;
        setIsInternal(userRow?.is_internal || false);
        if (!userRow?.id) {
          setProfilePhotoUrl(null);
          setProfilePhotoLoading(false);
          return;
        }
        // Now get the profile row by user_id
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("profile_photo")
          .eq("user_id", userRow.id)
          .maybeSingle();
        if (profileError) throw profileError;
        setProfilePhotoUrl(profile?.profile_photo || null);
      } catch (err: unknown) {
        setProfilePhotoError("Failed to load profile photo");
        setProfilePhotoUrl(null);
        console.error("Error fetching profile photo:", err);
      } finally {
        setProfilePhotoLoading(false);
      }
    };
    if (isSignedIn && isLoaded) {
      fetchProfilePhoto();
    } else {
      setProfilePhotoUrl(null);
    }
  }, [user, isSignedIn, isLoaded]);

  const handleNavigation = (href: string) => {
    setIsNavigating(true);
    router.push(href);
  };

  const handleSignOut = async () => {
    try {
      await signOut({ redirectUrl: "/landing" });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isActiveRoute = (href: string) => {
    if (href === "#") {
      return pathname === "/";
    }
    return pathname === href;
  };

  // MVP/Waitlist phase navigation - simplified for launch
  const navigationItems = [
    { name: "About", href: "/about", icon: MessageCircle },
    { name: "Safety & Trust", href: "/user-safety", icon: Shield },
    { name: "Privacy Policy", href: "/privacy", icon: Compass },
    { name: "Terms of Service", href: "/terms", icon: Shield },
    { name: "Data Deletion", href: "/data-deletion", icon: Shield },
    { name: "Community Guidelines", href: "/community-guidelines", icon: Shield },
  ];

  const menuItems = [
    {
      key: "auth",
      label: <span>{`Signed in as ${user?.username}`}</span>,
    },
    {
      key: "profile",
      label: "My Profile",
      // onClick: () => handleNavigation("/profile"),
      // onClick: () => router.replace("/profile"),
      href: "/profile",
    },
    {
      key: "Groups",
      label: "My Groups",
      // onClick: () => handleNavigation("/groups"),
      // onClick: () => router.replace("/groups"),
      href: "/groups",
    },
    // {
    //   key: "analytics",
    //   label: "Analytics",
    //   onClick: () => handleNavigation("/analytics"),
    // },
    // {
    //   key: "system",
    //   label: "System",
    //   onClick: () => handleNavigation("/system"),
    // },
    // {
    //   key: "configurations",
    //   label: "Configurations",
    //   onClick: () => handleNavigation("/configurations"),
    // },
    // {
    //   key: "help_and_feedback",
    //   label: "Help & Feedback",
    //   onClick: () => handleNavigation("/help"),
    // },
    {
      key: "logout",
      label: <p className="text-danger">Log Out</p>,
      onClick: handleSignOut,
    },
  ];

  const handleJoinWaitlist = () => {
    trackEvent("waitlist_click", { source: "navbar" });
    setIsWaitlistModalOpen(true);
  };

  /** Waitlist launch: public sees minimal navbar (brand + Join Waitlist); signed-in = bypass, full navbar */
  const isWaitlistLaunchMode =
    process.env.NEXT_PUBLIC_LAUNCH_WAITLIST_MODE === "true" ||
    process.env.NEXT_PUBLIC_LAUNCH_WAITLIST_MODE === "1";
  const showWaitlistNavbar = isWaitlistLaunchMode && !isSignedIn;

  // Prepare sidebar menu items for MVP (simplified for waitlist launch)
  const sidebarMenuItems = showWaitlistNavbar
    ? [
        ...navigationItems.map((item) => ({
          label: item.name,
          href: item.href,
          icon: item.icon,
        })),
        {
          label: "Get early access",
          href: "#",
          onClick: () => {
            setIsSidebarOpen(false);
            handleJoinWaitlist();
          },
        },
      ]
    : [
        ...navigationItems.map((item) => ({
          label: item.name,
          href: item.href,
          icon: item.icon,
        })),
        {
          label: "Get early access",
          href: "#",
          onClick: () => {
            setIsSidebarOpen(false);
            handleJoinWaitlist();
          },
        },
      ];

  return (
    <>
      {/* Waitlist Modal */}
      <WaitlistModal
        open={isWaitlistModalOpen}
        onOpenChange={setIsWaitlistModalOpen}
        source="navbar"
      />

      {/* Full-screen Mobile Menu Overlay */}
      <MobileMenuOverlay
        open={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        menuItems={navigationItems.map((item) => ({
          label: item.name,
          href: item.href,
          icon: item.icon,
        }))}
        onJoinWaitlist={handleJoinWaitlist}
      />

      {/* {isNavigating && <Spinner />} */}
      <Navbar
        height={"5rem"}
        onMenuOpenChange={setIsMenuOpen}
        isBordered={false}
        className={`font-sans transition-[backdrop-filter,background-color] duration-250 ease-in-out ${isSidebarOpen ? "bg-transparent backdrop-blur-none border-none shadow-none" : "bg-background border-none"}`}
        classNames={{
          wrapper: "max-w-full px-6 md:px-8 xl:px-12 bg-transparent",
        }}
      >
        {/* Navigation Links - hidden during waitlist launch for public users */}
        {/* {!showWaitlistNavbar && (
          <NavbarContent className="hidden xl:flex gap-10" justify="start">
            {navigationItems.map((item) => (
              <NavbarItem key={item.name} isActive={isActiveRoute(item.href)}>
                <Link
                  // color={isActiveRoute(item.href) ? "primary" : "foreground"}
                  color={"foreground"}
                  href={item.href}
                  onClick={() => handleNavigation(item.href)}
                  className={`text-sm font-medium transition-all duration-300 ease-in-out flex items-center gap-2 ${
                    isActiveRoute(item.href)
                      ? "text-primary"
                      : "hover:text-primary"
                  }`}
                  aria-current={isActiveRoute(item.href) ? "page" : undefined}
                >
                  {item.name}
                </Link>
              </NavbarItem>
            ))}
          </NavbarContent>
        )} */}

        {/* Logo */}
        <NavbarBrand className="flex items-center gap-2">
          <Link
            href="/"
            className="!opacity-100 flex items-center"
            onClick={() => handleNavigation("/")}
          >
            <Image
              src="/logo.webp"
              alt="Kovari"
              width={400}
              height={160}
              className="h-5 sm:h-6 w-auto object-contain block dark:hidden sm:-translate-y-1 filter brightness-100 contrast-125"
              priority
            />
            <Image
              src="/logo_dark.webp"
              alt="Kovari"
              width={400}
              height={160}
              className="h-5 sm:h-6 w-auto object-contain hidden dark:block sm:-translate-y-1 filter brightness-100 contrast-125"
              priority
            />
          </Link>
          {isInternal && (
            <span className="text-[10px] font-bold tracking-widest bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded-full uppercase select-none animate-pulse">
              Test Mode
            </span>
          )}
        </NavbarBrand>

        <NavbarContent as="div" justify="end">
          <div className="flex items-center gap-x-3">
            {/* Waitlist launch: Join Waitlist CTA instead of Log In / Avatar */}
            {showWaitlistNavbar ? (
              <>
                <Link href={`${getProductionAppUrl()}/sign-in`} className="hidden sm:flex">
                  <Button
                    className="px-4 h-9 rounded-full font-medium text-foreground hover:text-foreground bg-transparent hover:bg-transparent"
                  >
                    Log In
                  </Button>
                </Link>
                <Button
                  variant="default"
                  className="hidden sm:flex px-4 h-9 rounded-full"
                  onClick={handleJoinWaitlist}
                >
                  Early access
                </Button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className="relative flex items-center gap-1 sm:gap-1.5 focus:outline-none sm:hidden"
                  aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
                >
                  <div className="relative w-6 h-4 flex flex-col justify-center items-center">
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        rotate: isSidebarOpen ? 45 : 0,
                        y: isSidebarOpen ? 0 : -4,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        opacity: isSidebarOpen ? 0 : 1,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        rotate: isSidebarOpen ? -45 : 0,
                        y: isSidebarOpen ? 0 : 4,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                  {/* <span className="sm:text-sm text-xs font-medium uppercase select-none">
                    MENU
                  </span> */}
                </button>
              </>
            ) : (
              <>
                {/* Avatar/Sign In - only visible on xl screens (>=1280px) */}
                <div className="hidden xl:flex items-center gap-x-3">
                  {!isLoaded || profilePhotoLoading ? (
                    <Skeleton className="w-8 h-8 rounded-full" />
                  ) : isSignedIn ? (
                    <DropdownMenu onOpenChange={onAvatarMenuOpenChange}>
                      <DropdownMenuTrigger asChild>
                        <Avatar
                          isBordered
                          as="button"
                          className={"transition-transform"}
                          color="secondary"
                          name={user?.fullName || user?.username || "User"}
                          size="sm"
                          src={profilePhotoUrl || user?.imageUrl}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="p-4 min-w-[160px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-border mr-8">
                        {menuItems.map((item) => (
                          <Link
                            key={item.key}
                            href={item.href}
                            className="flex flex-col"
                          >
                            <DropdownMenuItem
                              key={item.key}
                              onClick={item.onClick}
                              className={`font-semibold w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground !{item.className}`}
                            >
                              {item.label}
                            </DropdownMenuItem>
                          </Link>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex gap-x-2">
                      <Link href={`${getProductionAppUrl()}/sign-in`}>
                        <Button
                          variant="ghost"
                          className="hover:bg-secondary hover:text-primary px-4 h-9 rounded-full font-medium"
                        >
                          Log In
                        </Button>
                      </Link>
                      <Link href={`${getProductionAppUrl()}/sign-up`}>
                        <Button
                          variant="default"
                          className="px-4 h-9 rounded-full font-medium"
                        >
                          Get Started
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
                {/* Hamburger - visible on screens < 1300px (xl breakpoint) */}
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className="relative flex items-center gap-1 sm:gap-1.5 focus:outline-none xl:hidden"
                  aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
                >
                  <div className="relative w-6 h-4 flex flex-col justify-center items-center">
                    {/* Top line */}
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        rotate: isSidebarOpen ? 45 : 0,
                        y: isSidebarOpen ? 0 : -4,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                    {/* Middle line */}
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        opacity: isSidebarOpen ? 0 : 1,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                    {/* Bottom line */}
                    <motion.div
                      className="w-4 h-[1.5px] bg-black absolute"
                      animate={{
                        rotate: isSidebarOpen ? -45 : 0,
                        y: isSidebarOpen ? 0 : 4,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                  {/* <span className="sm:text-sm text-xs font-medium uppercase select-none">
                    MENU
                  </span> */}
                </button>
              </>
            )}
          </div>
        </NavbarContent>
      </Navbar>
    </>
  );
}

