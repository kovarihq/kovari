"use client";

import { useState, useEffect } from "react";
import {
  Home,
  Inbox,
  Search,
  Settings,
  ShieldCheck,
  Plus,
  MessageSquare,
  Mail,
  Moon,
  PanelLeft,
  MoreVertical,
  UserPlus,
  Users,
  Bell,
  Send,
  Heart,
  MessageSquarePlus,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import HomeIcon from "@mui/icons-material/Home";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { FeedbackDialog } from "@/features/feedback/components/FeedbackDialog";
import { useFeedback } from "@/features/feedback/hooks/useFeedback";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroupLabel,
  SidebarInput,
  useSidebar,
  SidebarTrigger,
} from "@/shared/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useUser, useClerk } from "@clerk/nextjs";
import { Avatar } from "@heroui/react";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import Image from "next/image";

// Section 1: Main Navigation
const mainItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    // Mapping "Explore" to generic list item style or keeping name
    title: "Explore",
    url: "/explore",
    icon: Search,
  },
  {
    title: "Orders",
    url: "#",
    icon: Inbox, // Dummy to match image feel if desired, but better sticking to user functionality.
  },
];

// Cleaned up items based on User's actual routes + Image structure
const navMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Explore",
    url: "/explore",
    icon: Search,
  },

  {
    title: "Chats",
    url: "/chat",
    icon: Send,
  },
  {
    title: "Groups",
    url: "/groups",
    icon: Users,
  },
  {
    title: "Requests", // Dummy to match image 'Email'
    url: "/requests",
    icon: Heart,
  },
  {
    title: "Notifications",
    url: "/notifications",
    icon: Bell,
  },
];

// const navApps = [

// ];

const navFooter = [
  {
    title: "Safety",
    url: "/safety",
    icon: ShieldCheck,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  }
];

export const AcmeLogo = () => {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg
        fill="none"
        height="20"
        viewBox="0 0 32 32"
        width="20"
        className="text-white"
      >
        <path
          clipRule="evenodd"
          d="M17.6482 10.1305L15.8785 7.02583L7.02979 22.5499H10.5278L17.6482 10.1305ZM19.8798 14.0457L18.11 17.1983L19.394 19.4511H16.8453L15.1056 22.5499H24.7272L19.8798 14.0457Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
    </div>
  );
};

const SidebarToggle = () => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="bg-transparent text-foreground hover:bg-transparent hover:text-foreground"
      onClick={toggleSidebar}
    >
      <PanelLeft className="h-5 w-5 transition-transform duration-300 ease-in-out" />
    </Button>
  );
};

export function AppSidebar() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSidebar();
  const [profileData, setProfileData] = useState<any>(null);
  const { open: feedbackOpen, setOpen: setFeedbackOpen } = useFeedback();

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user?.id) {
        setProfileData(null);
        return;
      }
      try {
        const res = await fetch("/api/profile/current");
        if (!res.ok) {
          setProfileData(null);
          return;
        }
        const json = await res.json();
        setProfileData(json?.data || null);
      } catch {
        setProfileData(null);
      }
    };
    fetchProfileData();
  }, [user?.id]);

  const avatarSrc =
    profileData?.avatar && profileData.avatar.trim() !== ""
      ? profileData.avatar
      : "";

  const displayName = profileData?.name || "Loading...";
  const displaySubtitle = profileData?.username ? `@${profileData.username}` : "";

  const menuItems = [
    // {
    //   key: "auth",
    //   label: <span className="text-xs text-muted-foreground">{`Signed in as ${user?.username}`}</span>,
    // },
    {
      key: "profile",
      label: "My Profile",
      onClick: () => router.push("/profile"),
    },
    {
      key: "logout",
      label: <p className="text-red-500">Log Out</p>,
      onClick: async () => {
        await signOut({ redirectUrl: "/sign-in" });
        router.push("/sign-in");
      },
    },
  ];

  return (
    <Sidebar collapsible="icon" className="bg-card border-r">
      <SidebarHeader className="bg-card border-b">
        <div
          className="
              flex items-center border-none mb-1 mt-1
              justify-between
              group-data-[state=collapsed]:justify-center
              group-data-[state=collapsed]:border-none
              group-data-[state=collapsed]:p-0
            "
        >
          <div
            className="relative flex items-center justify-start"
            style={{ width: 140 }}
          >
            <Image  
              src="/logo.webp"
              alt="Kovari"
              width={400}
              height={160}
              className="h-4 px-2 group-data-[state=collapsed]:px-0 w-auto object-contain block dark:hidden"
              priority
            />
            <Image  
              src="/logo_dark.webp"
              alt="Kovari"
              width={400}
              height={160}
              className="h-4 px-2 group-data-[state=collapsed]:px-0 w-auto object-contain hidden dark:block"
              priority
            />
          </div>
          <SidebarToggle />
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-card">
        {/* Main Section */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => {
                const isActive =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname === item.url ||
                      pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`transition-all duration-200 rounded-md ${
                        isActive
                          ? "text-primary  data-[active=true]:text-primary"
                          : "text-foreground"
                      }`}
                    >
                      <Link href={item.url}>
                        <item.icon
                          className={
                            isActive
                              ? item.title === "Explore"
                                ? "text-primary"
                                : "text-primary fill-current"
                              : "text-foreground"
                          }
                          strokeWidth={
                            isActive && item.title === "Explore" ? 3 : undefined
                          }
                        />
                        <span className="font-normal">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* APPS Section */}
        {/* <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/70 tracking-wider">APPS</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {navApps.map((item) => {
                         const isActive = pathname === item.url;
                         return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton 
                                    asChild 
                                    isActive={isActive}
                                    className={`transition-all duration-200 ${
                                        isActive 
                                        ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:text-white data-[active=true]:bg-transparent data-[active=true]:text-white shadow-md"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <a href={item.url}>
                                        <item.icon className={isActive ? "text-white" : "text-gray-500"} />
                                        <span>{item.title}</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )
                    })}
                     <SidebarMenuItem>
                        <SidebarMenuButton className="text-muted-foreground hover:text-foreground">
                            <Plus className="h-4 w-4" />
                            <span>Add Apps</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup> */}

        {/* Footer/Settings Section in Content if we want it scrollable, or Footer slot for fixed */}
        <SidebarGroup className="mt-auto border-b border-border">
          <SidebarGroupContent>
            <SidebarMenu>
              {navFooter.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon className="text-foreground" />
                      <span className="text-foreground font-normal">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => setFeedbackOpen(true)}
                  className="cursor-pointer"
                >
                  <MessageSquarePlus className="text-foreground" />
                  <span className="text-foreground font-normal">Feedback</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* <SidebarMenuItem>
                        <div className="flex items-center justify-between px-2 py-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Moon className="h-4 w-4" />
                                <span>Dark Mode</span>
                            </div>
                            <Switch id="dark-mode" />
                        </div>
                    </SidebarMenuItem> */}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-card">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none active:outline-none"
                >
                  <Avatar
                    src={avatarSrc}
                    alt={displayName}
                    className="h-6 w-6 rounded-full bg-gray-200 aspect-square shrink-0 focus:outline-none"
                  />
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold text-xs">
                      {displayName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {displaySubtitle}
                    </span>
                  </div>
                  <MoreVertical className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width] p-2 backdrop-blur-2xl bg-transparent rounded-2xl shadow-sm transition-all duration-300 ease-in-out border-border"
              >
                {menuItems.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    onClick={item.onClick}
                    className={`font-semibold w-full rounded-md px-4 py-1 text-xs border-none cursor-pointer flex items-center hover:bg-sidebar-accent focus:bg-sidebar-accent focus:outline-none bg-transparent text-foreground focus:text-foreground ${!item.onClick ? "cursor-default opacity-70" : ""}`}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </Sidebar>
  );
}

