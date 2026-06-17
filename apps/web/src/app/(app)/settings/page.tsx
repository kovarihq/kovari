"use client";

import React, { useState, useCallback } from "react";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import {
  SettingsSidebar,
  AccountSection,
  SecuritySection,
  DangerZoneSection,
  LegalSection,
  AppearanceSection,
} from "@/shared/components/settings";
import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("email");
  const isMobile = useIsMobile();

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
  }, []);

  const renderContent = () => {
    if (activeTab === "email") return <AccountSection />;
    if (activeTab === "password") return <SecuritySection />;
    if (activeTab === "appearance") return <AppearanceSection />;
    if (activeTab === "delete") return <DangerZoneSection />;
    if (activeTab === "legal") return <LegalSection />;
    return <AccountSection />;
  };

  return (
    <div className="flex flex-col min-h-screen h-full bg-background text-foreground border-none rounded-none font-sans">
      {/* Mobile back nav */}
      <MobileBackNav title="Settings" fallbackHref="/profile" />

      {/* Main Content — match profile edit container/sidebar/content */}
      <div className={`flex flex-col md:flex-row min-h-[90vh] h-full text-foreground rounded-3xl border mx-3 mb-6 md:mx-6 ${!isMobile?"bg-card border-border": "border border-none"}`}>
        {!isMobile && (
          <div className="w-full md:w-1/4 lg:w-1/5 md:border-r-1 border-border h-full flex flex-col self-stretch">
            <SettingsSidebar
              activeTab={activeTab}
              setActiveTab={handleTabChange}
            />
          </div>
        )}
        <div className={`flex-1 flex flex-col gap-2 ${isMobile? "p-2": "p-4 md:p-3"}`}>
          {isMobile ? (
            <div className="flex flex-col gap-6">
              <AccountSection />
              <SecuritySection />
              <AppearanceSection />
              <DangerZoneSection />
              <LegalSection />
            </div>
          ) : (
            <div className="space-y-6">{renderContent()}</div>
          )}
        </div>
      </div>
    </div>
  );
}

