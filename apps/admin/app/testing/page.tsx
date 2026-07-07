"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Wrench, 
  Search, 
  RefreshCw, 
  HelpCircle,
  AlertTriangle
} from "lucide-react";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { Button } from "@/components/ui/button";

interface TestUser {
  id: string;
  name: string | null;
  email: string | null;
  account_type: string;
  test_role: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  onboarding_completed: boolean | null;
  profiles: {
    username: string | null;
    profile_photo: string | null;
  } | null;
}

export default function TestingPage() {
  const router = useRouter();
  const [users, setUsers] = useState<TestUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchTestUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/testing");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        showToast("error", "Failed to fetch test users.");
      }
    } catch (err) {
      showToast("error", "Error connecting to testing API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTestUsers();
  }, []);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return (
      (user.name?.toLowerCase().includes(term)) ||
      (user.email?.toLowerCase().includes(term)) ||
      (user.test_role?.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-full mx-auto space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-none border text-sm max-w-md transition-all duration-300 ${
          notification.type === "success" 
            ? "bg-green-50/90 text-green-800 border-green-200 dark:bg-green-950/90 dark:text-green-200 dark:border-green-800" 
            : "bg-red-50/90 text-destructive border-red-200 dark:bg-red-950/90 dark:text-destructive dark:border-red-800"
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="space-y-0">
          <h1 className="text-lg font-semibold tracking-tight">Testing Control Center</h1>
          <p className="text-md text-muted-foreground">Manage test accounts, seed baseline scenarios, and perform targeted scope resets</p>
        </div>
        <Button 
          variant="outline"
          size="sm"
          onClick={fetchTestUsers}
          className="rounded-xl h-10 !px-5 gap-2 bg-card transition-all shadow-none"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Safety Notice Banner */}
      <div className="bg-amber-50/30 border border-amber-200/50 rounded-xl p-4 flex gap-3 text-sm text-amber-900 dark:text-amber-200 dark:bg-amber-950/10 dark:border-amber-900/50">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Production Safety Guard Active</span>
          Reset features are exclusively available for test accounts (`account_type = INTERNAL`). Modifications on organic users are locked.
        </div>
      </div>

      {/* Filter and List Container */}
      <div className="space-y-4 max-w-full">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search test accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 h-10 border rounded-xl w-full bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary border-border"
          />
        </div>

        <div>
          <SectionHeader>Registered Test Accounts {filteredUsers.length > 0 && `(${filteredUsers.length})`}</SectionHeader>
          {loading && users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground bg-card border rounded-xl animate-pulse">
              Loading test accounts...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm space-y-2 border border-dashed rounded-xl bg-card">
              <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="font-medium">No test users resolved</p>
            </div>
          ) : (
            <GroupContainer>
              {filteredUsers.map((user) => {
                const avatar = (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs shrink-0 border overflow-hidden">
                    {user.profiles?.profile_photo ? (
                      <img src={user.profiles.profile_photo} alt={user.name || ""} className="h-full w-full object-cover" />
                    ) : (
                      user.name?.[0] || "?"
                    )}
                  </div>
                );
                return (
                  <ListRow
                    key={user.id}
                    icon={avatar}
                    label={user.name || "Test User"}
                    secondary={user.email}
                    showChevron={true}
                    onClick={() => router.push(`/testing/${user.id}`)}
                    trailing={
                      <span className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-[9px] px-2 py-0.5 rounded-full border border-yellow-500/20 font-bold uppercase">
                        {user.test_role}
                      </span>
                    }
                  />
                );
              })}
            </GroupContainer>
          )}
        </div>
      </div>
    </div>
  );
}
