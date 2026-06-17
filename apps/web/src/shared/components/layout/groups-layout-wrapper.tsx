"use client";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CardBody, Card, Image, Divider, Avatar } from "@heroui/react";
import { Tabs, Tab } from "@heroui/react";
import { Calendar, MapPin } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import Link from "next/link";
import { cn } from "@kovari/utils";
import { buttonVariants } from "@/shared/components/ui/button";

import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

const TABS = [
  { label: "Overview", href: "home" },
  { label: "Chats", href: "chat" },
  { label: "Itinerary", href: "itinerary" },
  { label: "Settings", href: "settings" },
] as const;

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ groupId: string }>();

  const getTabIndex = useCallback(() => {
    // If the path includes /settings, always select the Settings tab
    if (pathname.includes("/settings")) return 3; // Settings tab index
    const currentPath = pathname.split("/").pop() || "home";
    const tabIndex = TABS.findIndex((tab) => tab.href === currentPath);
    return tabIndex > -1 ? tabIndex : 0;
  }, [pathname]);

  const [activeTab, setActiveTab] = useState(getTabIndex());

  useEffect(() => {
    setActiveTab(getTabIndex());
  }, [pathname, getTabIndex]);

  const handleTabChange = useCallback(
    (index: number) => {
      if (index !== activeTab) {
        const tab = TABS[index];
        router.replace(`/groups/${params.groupId}/${tab.href}`, {
          scroll: false,
        });
      }
    },
    [activeTab, router, params.groupId],
  );

  const handleTabClick = useCallback(
    (index: number) => {
      handleTabChange(index);
    },
    [handleTabChange],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTabChange((activeTab + 1) % TABS.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTabChange((activeTab - 1 + TABS.length) % TABS.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleTabChange(index);
      } else if (event.key === "Home") {
        event.preventDefault();
        handleTabChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        handleTabChange(TABS.length - 1);
      }
    },
    [activeTab, handleTabChange],
  );

  const tabButtons = useMemo(
    () =>
      TABS.map((tab, idx) => (
        <Button
          key={tab.label}
          variant={"outline"}
          className={`text-xs sm:text-sm ${
            activeTab === idx
              ? "text-primary bg-card font-semibold rounded-2xl shadow-sm hover:bg-card hover:text-primary border-1 border-primary dark:border-primary"
              : "text-foreground font-semibold bg-card rounded-2xl hover:text-primary hover:bg-card"
          }`}
          onClick={() => handleTabClick(idx)}
          onKeyDown={(e) => handleTabKeyDown(e, idx)}
        >
          {tab.label}
        </Button>
      )),
    [activeTab, handleTabClick, handleTabKeyDown],
  );

  return (
    <div className="flex flex-col bg-background text-foreground w-full">
      {/* Mobile back nav */}
      <MobileBackNav title="Groups" forceHref="/groups" titleClassName="text-xs" />

      <div className="flex bg-background text-foreground px-2 py-0 sm:px-4 pb-4">
        {/* Sidebar can go here */}
        <div className="flex-1 flex flex-col">
          <header className="flex sticky top-0 z-50 bg-background py-4">
            <div className="flex gap-2 flex-shrink-0">{tabButtons}</div>
          </header>
          <main className="flex-1 pt-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

