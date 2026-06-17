"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Users, Send } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { cn } from "@kovari/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!user?.id) {
        setProfilePhotoUrl(null);
        return;
      }
      try {
        const res = await fetch("/api/profile/current");
        if (!res.ok) {
          setProfilePhotoUrl(null);
          return;
        }
        const json = await res.json();
        const avatarUrl = json?.data?.avatar;
        setProfilePhotoUrl(
          avatarUrl && avatarUrl.trim() !== "" ? avatarUrl : null,
        );
      } catch {
        setProfilePhotoUrl(null);
      }
    };
    fetchProfilePhoto();
  }, [user?.id]);

  const profileAvatarSrc =
    profilePhotoUrl && profilePhotoUrl.trim() !== ""
      ? profilePhotoUrl
      : user?.imageUrl || undefined;

  // Only show the bottom nav on the 5 main tab routes.
  // Using an allowlist is more robust than a blocklist — new pages won't
  // accidentally inherit the bottom nav.
  const isMainTab =
    pathname === "/dashboard" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/groups") ||
    pathname.startsWith("/profile");

  // Exception: hide inside individual chat threads, group chats, and group detail pages (/groups/id/*)
  const isGroupDetailPage = pathname.startsWith("/groups/") && pathname !== "/groups";
  const isInsideThread =
    (pathname.startsWith("/chat/") && pathname !== "/chat") ||
    (pathname.startsWith("/groups/") && pathname.includes("/chat")) ||
    isGroupDetailPage;

  if (!isMainTab || isInsideThread) return null;

  const tabs = [
    {
      label: "Home",
      href: "/dashboard",
      icon: Home,
      isActive: (path: string) => path === "/dashboard" || path === "/",
    },
    {
      label: "Explore",
      href: "/explore",
      icon: Search,
      isActive: (path: string) => path.startsWith("/explore"),
    },
    {
      label: "Chats",
      href: "/chat",
      icon: Send,
      isActive: (path: string) => path.startsWith("/chat"),
    },
    {
      label: "Groups",
      href: "/groups",
      icon: Users,
      isActive: (path: string) => path.startsWith("/groups"),
    },
    {
      label: "Profile",
      href: "/profile",
      icon: null, // Special case for avatar
      isActive: (path: string) => path.startsWith("/profile"),
    },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.isActive(pathname));
  const validActiveIndex = activeIndex !== -1 ? activeIndex : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none md:hidden flex flex-col justify-end">
      {/* iOS 26 Content Mask Gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[120px] pointer-events-none bg-background"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.05) 20%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.8) 80%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.05) 20%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.8) 80%, rgba(0,0,0,1) 100%)",
        }}
      />

      {/* The Floating Nav Bar */}
      <div className="relative pointer-events-auto px-4 pb-4 pt-2">
        <div className="h-[56px] rounded-[40px] bg-transparent border border-border backdrop-blur-[10px] p-[2px]">
          <div className="relative w-full h-full flex">
            {/* Active Indicator Overlay Slider (Matches mobile AnimatedAlign) */}
            <div
              className="absolute top-0 bottom-0 left-0 flex items-center justify-center pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] px-[2px]"
              style={{ 
                width: `${100 / tabs.length}%`,
                transform: `translateX(${validActiveIndex * 100}%)` 
              }}
            >
              <div className="w-full max-w-[70px] h-full bg-primary opacity-15 rounded-[28px]" />
            </div>

            {tabs.map((tab) => {
              const active = tab.isActive(pathname);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className="relative flex-1 h-full flex flex-col items-center justify-center group z-10"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="flex flex-col items-center justify-center space-y-[1px]">
                    <div className="h-[30px] flex items-center justify-center">
                      {tab.label === "Profile" ? (
                        <div
                          className={cn(
                            "p-[1px] rounded-full border-[1.5px] transition-colors duration-300",
                            active ? "border-primary" : "border-transparent",
                          )}
                        >
                          <Avatar className="h-[22px] w-[22px]">
                            <AvatarImage
                              src={profileAvatarSrc}
                              alt={user?.fullName || "Profile"}
                            />
                            <UserAvatarFallback />
                          </Avatar>
                        </div>
                      ) : (
                        Icon && (
                          <Icon
                            className={cn(
                              "h-[20px] w-[20px] transition-colors duration-300",
                              active
                                ? tab.label === "Explore"
                                  ? "text-primary"
                                  : "text-primary fill-current"
                                : "text-muted-foreground",
                            )}
                            strokeWidth={
                              tab.label === "Explore" ? (active ? 3.5 : 2.5) : 2
                            }
                          />
                        )
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] transition-all duration-300",
                        active
                          ? "text-primary font-extrabold"
                          : "text-muted-foreground font-semibold",
                      )}
                    >
                      {tab.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


