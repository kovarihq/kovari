"use client";

import Image from "next/image";
import { useEffect, useState, Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Flag,
  UsersRound,
  Clock,
  Settings,
  FileText,
  BarChart3,
  Mail,
  PanelLeft,
  MoreVertical,
  Loader2,
  MessageSquare,
  TrendingUp,
  Wrench,
} from "lucide-react";
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
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser, useClerk } from "@clerk/nextjs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logo from "@/public/logo.webp";

interface Metrics {
  pendingFlags: number;
}

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  }, 
  {
    title: "Analytics",
    url: "/analytics",
    icon: TrendingUp,
  },
  {
    title: "Users",
    url: "/users",
    icon: Users,
  },
  {
    title: "Groups",
    url: "/groups",
    icon: Users,
  },
  {
    title: "Flags",
    url: "/flags",
    icon: Flag,
    badge: "pendingFlags",
  },
  {
    title: "Sessions",
    url: "/sessions",
    icon: Clock,
  },
  {
    title: "Feedback",
    url: "/feedback",
    icon: MessageSquare,
  },
  {
    title: "Emails",
    url: "/emails",
    icon: Mail,
  },
  {
    title: "Waitlist",
    url: "/waitlist",
    icon: BarChart3,
  },
  {
    title: "Audit Logs",
    url: "/audit",
    icon: FileText,
  },
  {
    title: "Testing",
    url: "/testing",
    icon: Wrench,
  },
];

const navFooter = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const SidebarToggle = () => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="bg-transparent text-foreground hover:bg-transparent !hover:text-foreground cursor-pointer"
      onClick={toggleSidebar}
    >
      <PanelLeft className="h-5 w-5 transition-transform duration-300 ease-in-out" />
    </Button>
  );
};

export function AdminSidebar({
  setIsNavigating,
}: {
  setIsNavigating: (val: boolean) => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [metrics, setMetrics] = useState<Metrics>({ pendingFlags: 0 });

  const dropdownMenuItems = [
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
                src={logo}
                alt="Kovari"
                height={16}
                className="h-4 px-2 group-data-[state=collapsed]:px-0 w-auto object-contain block"
                priority
                            />
            </div>
            <SidebarToggle />
          </div>
        </SidebarHeader>

        <SidebarContent className="bg-card">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => {
                  const isActive =
                    item.url === "/"
                      ? pathname === "/"
                      : pathname === item.url ||
                        pathname.startsWith(item.url + "/");
                  const badgeCount =
                    item.badge === "pendingFlags"
                      ? metrics.pendingFlags
                      : undefined;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={`transition-all duration-200 rounded-md ${
                          isActive
                            ? "text-primary data-[active=true]:text-primary"
                            : "text-foreground"
                        }`}
                        onClick={() => {
                          if (pathname !== item.url) {
                            setIsNavigating(true);
                          }
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Link href={item.url}>
                          <item.icon
                            className={
                              isActive ? "text-primary" : "text-foreground"
                            }
                          />
                          <span className="font-normal">{item.title}</span>
                          {badgeCount !== undefined && badgeCount > 0 && (
                            <SidebarMenuBadge>
                              <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ios-shadow">
                                {badgeCount}
                              </div>
                            </SidebarMenuBadge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-auto border-b border-border">
            <SidebarGroupContent>
              <SidebarMenu>
                {navFooter.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      onClick={() => {
                        if (pathname !== item.url) {
                          setIsNavigating(true);
                        }
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <Link href={item.url}>
                        <item.icon className="text-foreground" />
                        <span className="text-foreground font-normal">
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none active:outline-none cursor-pointer"
                  >
                     <Avatar className="size-6 rounded-full overflow-hidden">
                      <AvatarImage
                        src={user?.imageUrl || ""}
                        alt={user?.fullName || "User"}
                      />
                      <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">
                        {user?.firstName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold text-xs">
                        {user?.fullName || "User Name"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.emailAddresses?.[0]?.emailAddress ||
                          "user@example.com"}
                      </span>
                    </div>
                    <MoreVertical className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="w-[--radix-popper-anchor-width] min-w-[100px] p-0 backdrop-blur-2xl bg-card/90 rounded-xl shadow-lg border-border"
                  style={{ width: "var(--radix-popper-anchor-width)" }}
                >
                  {dropdownMenuItems.map((item, index) => (
                    <Fragment key={item.key}>
                      <DropdownMenuItem
                        onClick={item.onClick}
                        className={`font-semibold w-full rounded-none px-4 py-2.5 text-xs border-none cursor-pointer flex items-center hover:bg-sidebar-accent !hover:text-foreground !focus:text-foreground focus:bg-sidebar-accent focus:outline-none bg-transparent text-foreground focus:text-foreground ${!item.onClick ? "cursor-default opacity-70" : ""}`}
                      >
                        {item.label}
                      </DropdownMenuItem>
                      {index < dropdownMenuItems.length - 1 && <DropdownMenuSeparator className="mx-0 my-0" />}
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
  );
}
