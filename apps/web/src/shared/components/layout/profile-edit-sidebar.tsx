"use client";
import React, { KeyboardEvent, useCallback, useMemo, useRef } from "react";
import { User, Briefcase, Globe2, MapPin } from "lucide-react";

const TABS = [
  { key: "general", label: "General", icon: User, category: "profile" },
  {
    key: "professional",
    label: "Professional",
    icon: Briefcase,
    category: "profile",
  },
  { key: "personal", label: "Personal", icon: Globe2, category: "profile" },
  { key: "travel", label: "Travel", icon: MapPin, category: "profile" },
] as const;

interface ProfileEditSidebarProps {
  activeTab: string;
  setActiveTab: (key: string) => void;
}

const ProfileEditSidebar: React.FC<ProfileEditSidebarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastClickTime = useRef<number>(0);

  const handleTabClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, key: string) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastClickTime.current < 300) {
        return;
      }
      lastClickTime.current = now;
      if (activeTab !== key) {
        setActiveTab(key);
      }
    },
    [activeTab, setActiveTab]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (activeTab !== key) {
          setActiveTab(key);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const currentIndex = TABS.findIndex((tab) => tab.key === activeTab);
        const nextIndex = (currentIndex + 1) % TABS.length;
        const nextTab = TABS[nextIndex].key;
        if (activeTab !== nextTab) {
          setActiveTab(nextTab);
          setTimeout(() => tabRefs.current[nextIndex]?.focus(), 0);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const currentIndex = TABS.findIndex((tab) => tab.key === activeTab);
        const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        const prevTab = TABS[prevIndex].key;
        if (activeTab !== prevTab) {
          setActiveTab(prevTab);
          setTimeout(() => tabRefs.current[prevIndex]?.focus(), 0);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        const firstTab = TABS[0].key;
        if (activeTab !== firstTab) {
          setActiveTab(firstTab);
          setTimeout(() => tabRefs.current[0]?.focus(), 0);
        }
      } else if (e.key === "End") {
        e.preventDefault();
        const lastTab = TABS[TABS.length - 1].key;
        if (activeTab !== lastTab) {
          setActiveTab(lastTab);
          setTimeout(() => tabRefs.current[TABS.length - 1]?.focus(), 0);
        }
      }
    },
    [activeTab, setActiveTab]
  );

  // Grouping for future extensibility (currently only one group)
  const groupedTabs = useMemo(() => {
    return {
      profile: TABS.filter((tab) => tab.category === "profile"),
    };
  }, []);

  const renderTabGroup = (
    groupKey: string,
    tabs: Array<(typeof TABS)[number]>,
    title?: string
  ) => (
    <div
      key={groupKey}
      className="flex flex-row md:flex-col gap-x-2 md:gap-x-0 md:gap-y-1 flex-nowrap overflow-x-auto md:overflow-x-visible whitespace-nowrap px-1 md:px-0"
    >
      {title && (
        <div className="hidden md:block px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
      )}
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            className={
              `flex items-center gap-2 px-3 sm:px-5 py-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20  transition-colors font-medium text-xs sm:text-sm flex-shrink-0 md:w-full md:justify-start justify-center min-w-[80px]` +
              (activeTab === tab.key
                ? " text-primary bg-secondary font-semibold"
                : " text-muted-foreground hover:text-foreground hover:bg-secondary")
            }
            aria-current={activeTab === tab.key ? "page" : undefined}
            aria-label={tab.label}
            tabIndex={0}
            onClick={(e) => handleTabClick(e, tab.key)}
            onKeyDown={(e) => handleKeyDown(e, tab.key)}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
          >
            {/* <Icon className="h-4 w-4" /> */}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <nav
      aria-label="Profile Navigation"
      className="flex flex-row md:flex-col gap-2 md:gap-4 p-2 md:p-4 border-border overflow-x-auto md:overflow-y-auto"
    >
      {renderTabGroup("profile", groupedTabs.profile, "Profile")}
    </nav>
  );
};

export default ProfileEditSidebar;

