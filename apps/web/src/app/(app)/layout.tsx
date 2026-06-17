"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/shared/components/ui/sidebar";
import { SidebarWrapper } from "@/shared/components/layout/sidebar-wrapper";
import { AppSidebar } from "@/shared/components/layout/app-sidebar";
import LayoutWrapper from "@/shared/components/layout/app-layout-wrapper";
import ProtectedRoute from "@/shared/components/protected-route";
import DirectMessageListener from "@/shared/components/direct-message-listener";
import { BottomNav } from "@/shared/components/layout/bottom-nav";
import { PolicyGate } from "@/shared/components/policy-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Must mirror the allowlist in BottomNav so padding is only applied when the nav is visible.
  const isMainTab =
    pathname === "/dashboard" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/groups") ||
    pathname.startsWith("/profile");

  const isInsideThread =
    (pathname.startsWith("/chat/") && pathname !== "/chat") ||
    (pathname.startsWith("/groups/") && pathname.includes("/chat"));

  const isBottomNavVisible = isMainTab && !isInsideThread;

  return (
    <>
      <DirectMessageListener />
      <ProtectedRoute>
        <SidebarProvider>
          <SidebarWrapper />
          <PolicyGate>
            <main
              className={`flex-1 min-h-0 flex flex-col ${
                isBottomNavVisible ? "pb-16 md:pb-0" : "pb-0"
              }`}
            >
              {children}
            </main>
            <BottomNav />
          </PolicyGate>
        </SidebarProvider>
      </ProtectedRoute>
    </>
  );
}

