"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  Wrench, 
  User, 
  MessageSquare, 
  ArrowRightLeft, 
  Users, 
  Bell, 
  Trash2, 
  Activity, 
  AlertTriangle,
  UserCheck,
  ShieldCheck,
  Calendar,
  Clock,
  Key,
  ChevronLeft,
  Loader2,
  RefreshCw
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
    age: number | null;
    gender: string | null;
    nationality: string | null;
    job: string | null;
    location: string | null;
    bio: string | null;
  } | null;
}

export default function TestingUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<TestUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [executing, setExecuting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchUserDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/testing/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        showToast("error", "Failed to fetch test user details.");
      }
    } catch (err) {
      showToast("error", "Error loading test user details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleActionClick = (action: string) => {
    if (!user) return;
    setActiveAction(action);
    setActionReason("Restoring test baseline for development session");
  };

  const handleExecuteAction = async () => {
    if (!user || !activeAction) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/admin/testing/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: activeAction, reason: actionReason })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("success", `Successfully executed: ${activeAction}`);
        setActiveAction(null);
        fetchUserDetails();
      } else {
        showToast("error", data.error || "Action execution failed.");
      }
    } catch (err) {
      showToast("error", "Network error executing action.");
    } finally {
      setExecuting(false);
    }
  };

  const getRoleDescription = (role: string | null) => {
    switch (role) {
      case "GENERAL": return "Alpha User: General system testing";
      case "MATCHING": return "Beta User: Matching scenarios & engine checks";
      case "CHAT": return "Gamma User: Direct messages & pipelines";
      case "GROUPS": return "Delta User: Multi-user group testing";
      case "EDGE_CASE": return "Omega User: High volume profile metric checks";
      case "RETENTION": return "Epsilon User: Notifications & session retention checks";
      default: return "Testing account scenario";
    }
  };

  if (loading && !user) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-full mx-auto space-y-6">
        <Button variant="ghost" onClick={() => router.push("/testing")} className="gap-1.5 -ml-3">
          <ChevronLeft className="h-4 w-4" />
          Back to Testing
        </Button>
        <div className="border border-dashed border-border rounded-xl p-16 text-center text-muted-foreground bg-card">
          <User className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-semibold text-foreground">User not found</h3>
          <p className="text-xs mt-1">This user could not be resolved or is not marked as internal.</p>
        </div>
      </div>
    );
  }

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

      {/* Back navigation */}
      <div>
        <Button 
          variant="ghost" 
          onClick={() => router.push("/testing")} 
          className="gap-1.5 -ml-3 text-muted-foreground hover:text-foreground font-semibold h-9 rounded-xl shadow-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Testing Control Center
        </Button>
      </div>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center font-bold text-lg shrink-0 border overflow-hidden">
            {user.profiles?.profile_photo ? (
              <img src={user.profiles.profile_photo} alt={user.name || ""} className="h-full w-full object-cover" />
            ) : (
              user.name?.[0] || "?"
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              {user.name}
              <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                {user.test_role}
              </span>
            </h1>
            <p className="text-md text-muted-foreground">{user.email}</p>
          </div>
        </div>
        
        <Button 
          variant="outline"
          size="sm"
          onClick={fetchUserDetails}
          className="rounded-xl h-10 !px-5 gap-2 bg-card transition-all shadow-none"
        >
          <RefreshCw className="h-4 w-4" />
          Sync Details
        </Button>
      </div>

      {/* Controls Content */}
      <div className="max-w-full space-y-6">
        {/* Account Identity Card */}
        <div>
          <SectionHeader>Account Identity</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<User className="h-4 w-4 text-foreground/75" />}
              label="Test Name & Role"
              secondary={
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-semibold text-foreground">{user.name}</span>
                  <span className="bg-primary/10 text-primary border border-primary/20 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                    {user.test_role}
                  </span>
                </div>
              }
              showChevron={false}
            />
            <ListRow
              icon={<Key className="h-4 w-4 text-foreground/75" />}
              label="Email & ID Mappings"
              secondary={
                <div className="space-y-0.5 text-xs text-muted-foreground mt-0.5">
                  <div>Email: {user.email}</div>
                  <div>UUID: {user.id}</div>
                </div>
              }
              showChevron={false}
              trailing={
                <div className="flex items-center gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </div>
              }
            />
          </GroupContainer>
        </div>

        {/* Status & Session Logs */}
        <div>
          <SectionHeader>Account Status</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<UserCheck className="h-4 w-4 text-foreground/75" />}
              label="Onboarding Progress"
              secondary={user.onboarding_completed ? "Fully Completed" : "Pending Profile Creation Tour"}
              showChevron={false}
              trailing={
                <span className={`text-xs font-semibold ${user.onboarding_completed ? "text-green-500" : "text-amber-500"}`}>
                  {user.onboarding_completed ? "Onboarded" : "Incomplete"}
                </span>
              }
            />
            <ListRow
              icon={<Calendar className="h-4 w-4 text-foreground/75" />}
              label="Registered On"
              secondary={user.created_at ? new Date(user.created_at).toLocaleString() : "Unknown"}
              showChevron={false}
            />
            <ListRow
              icon={<Clock className="h-4 w-4 text-foreground/75" />}
              label="Last Active Session"
              secondary={user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : "No active session"}
              showChevron={false}
            />
          </GroupContainer>
        </div>

        {/* Role Context Panel */}
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Scenario Purpose</span>
          <p className="text-sm font-semibold text-foreground">{getRoleDescription(user.test_role)}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Perform targeted resets below to test isolated features, or trigger a full baseline reset to restore default profile photos, bio, interests, and intentions.
          </p>
        </div>

        {/* Reset Scopes Panel */}
        <div>
          <SectionHeader>Targeted Reset Scopes</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<User className="h-4 w-4 text-primary" />}
              label="Reset Profile Details"
              secondary="Restores baseline photo, age, bio, and travel intentions"
              showChevron={true}
              onClick={() => handleActionClick("resetProfile")}
            />
            <ListRow
              icon={<Activity className="h-4 w-4 text-primary" />}
              label="Reset Onboarding Status"
              secondary="Sets completed flags to false to re-trigger initial onboarding tours"
              showChevron={true}
              onClick={() => handleActionClick("resetOnboarding")}
            />
            <ListRow
              icon={<MessageSquare className="h-4 w-4 text-primary" />}
              label="Clean Message History"
              secondary="Purges all direct messages and group conversation entries"
              showChevron={true}
              onClick={() => handleActionClick("resetChats")}
            />
            <ListRow
              icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
              label="Clean Matches & Swipes"
              secondary="Clears active matching interests, blocks, and swipes"
              showChevron={true}
              onClick={() => handleActionClick("resetMatches")}
            />
            <ListRow
              icon={<Users className="h-4 w-4 text-primary" />}
              label="Reset Groups & Memberships"
              secondary="Leaves group spaces and deletes user-created groups"
              showChevron={true}
              onClick={() => handleActionClick("resetGroups")}
            />
            <ListRow
              icon={<Bell className="h-4 w-4 text-primary" />}
              label="Clean Notifications"
              secondary="Deletes all user push and notification feed records"
              showChevron={true}
              onClick={() => handleActionClick("resetNotifications")}
            />
          </GroupContainer>
        </div>

        {/* Destructive Options */}
        <div>
          <SectionHeader className="text-destructive">Destructive Actions</SectionHeader>
          <GroupContainer className="border-border">
            <ListRow
              icon={<Trash2 className="h-4 w-4 text-destructive" />}
              label="Perform Full Baseline Reset"
              secondary="Wipes all messages, matches, groups, notifications and re-seeds baseline data"
              showChevron={true}
              destructive={true}
              onClick={() => handleActionClick("resetEverything")}
            />
          </GroupContainer>
        </div>
      </div>

      {/* Confirmation Modal */}
      {activeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-none space-y-5">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-lg font-bold text-foreground">Confirm Testing Action</h2>
            </div>
            
            <p className="text-sm text-muted-foreground leading-relaxed">
              You are about to run <strong className="text-foreground">{activeAction}</strong> on the test user 
              <strong className="text-foreground"> {user.name}</strong> ({user.email}).
            </p>

            {activeAction === "resetEverything" && (
              <p className="text-xs bg-destructive/20 text-destructive p-3 rounded-lg border border-destructive">
                <strong>Warning:</strong> This is a destructive operation. It will wipe all user-generated chats, matches, groups, and reset the profile fields.
              </p>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">Action Reason (for Audit Logs)</label>
              <input
                type="text"
                placeholder="Reason for running this action..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full border border-border rounded-lg p-2.5 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button 
                variant="ghost"
                onClick={() => { setActiveAction(null); }}
                disabled={executing}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleExecuteAction}
                disabled={executing}
              >
                {executing ? "Processing..." : "Confirm & Execute"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
