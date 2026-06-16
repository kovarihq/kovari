"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFullImageUrl } from "../lib/cloudinary-client";
import { GroupContainer } from "./ui/ios/GroupContainer";
import { ListRow } from "./ui/ios/ListRow";
import { SectionHeader } from "./ui/ios/SectionHeader";
import { StatusBadge } from "./ui/ios/StatusBadge";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { 
  Ban,
  AlertTriangle,
  FileText,
  MapPin,
  Calendar,
  CheckCircle2,
  Mail,
  User as UserIcon,
  MessageSquare,
  History as HistoryIcon,
  Info,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  History,
} from "lucide-react";
import { Textarea } from "./ui/textarea";

interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  username: string;
  email: string;
  number?: string;
  age: number;
  birthday?: string;
  gender: string;
  nationality: string;
  bio?: string;
  job?: string;
  location?: string;
  religion?: string;
  smoking?: string;
  drinking?: string;
  personality?: string;
  food_preference?: string;
  languages?: string[];
  interests?: string[];
  profile_photo?: string;
  verified: boolean;
  deleted?: boolean;
  users?: {
    banned: boolean;
    ban_reason?: string;
    ban_expires_at?: string;
    beta_status?: "not_invited" | "invited" | "activated";
    invite_date?: string;
    activation_date?: string;
  };
}

interface Flag {
  id: string;
  type: string;
  reason: string;
  status: string;
  created_at: string;
}

interface AdminNote {
  id: string;
  reason: string;
  created_at: string;
  admins?: {
    email: string;
  };
}

interface UserDetailProps {
  profile: UserProfile;
  flags: Flag[];
  sessions: Array<{ key: string; data: unknown }>;
  notes: AdminNote[];
  flagId?: string;
  feedbackCount?: number;
}

export function UserDetail({
  profile: initialProfile,
  flags: initialFlags,
  sessions: initialSessions,
  notes: initialNotes,
  flagId: propFlagId,
  feedbackCount = 0,
}: UserDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flagId = propFlagId || searchParams.get("flagId");
  const [profile, setProfile] = React.useState(initialProfile);
  const [flags, setFlags] = React.useState(initialFlags);
  const [notes, setNotes] = React.useState(initialNotes);
  const [isLoading, setIsLoading] = React.useState(false);
  const expectedStateRef = React.useRef<{
    banned?: boolean;
    ban_expires_at?: string | undefined;
  } | null>(null);

  React.useEffect(() => {
    if (expectedStateRef.current) {
      const serverBanned = initialProfile.users?.banned;
      const serverBanExpires = initialProfile.users?.ban_expires_at;
      const expected = expectedStateRef.current;

      if (serverBanned === expected.banned && serverBanExpires === expected.ban_expires_at) {
        expectedStateRef.current = null;
        setProfile(initialProfile);
      }
    } else {
      setProfile(initialProfile);
    }
    setFlags(initialFlags);
    setNotes(initialNotes);
  }, [initialProfile, initialFlags, initialNotes]);

  const [actionState, setActionState] = React.useState<{
    type: "suspend" | "ban" | "warn" | "note" | null;
    open: boolean;
  }>({ type: null, open: false });

  const [suspendForm, setSuspendForm] = React.useState({ reason: "", banUntil: "" });
  const [banForm, setBanForm] = React.useState({ reason: "" });
  const [warnForm, setWarnForm] = React.useState({ reason: "" });
  const [noteForm, setNoteForm] = React.useState({ note: "" });
  const [expandedNotes, setExpandedNotes] = React.useState<Set<string>>(new Set());

  const toggleNoteExpansion = (id: string) => {
    const next = new Set(expandedNotes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNotes(next);
  };

  const handleAction = async (
    action: "verify" | "ban" | "suspend" | "unban" | "warn",
    reason?: string,
    banUntil?: string
  ) => {
    setIsLoading(true);
    try {
      let parsedBanUntil = banUntil;
      if (action === "suspend" && banUntil) {
        parsedBanUntil = new Date(banUntil).toISOString();
      }

      const res = await fetch(`/api/admin/users/${profile.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, banUntil: parsedBanUntil, flagId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Action failed");
      }

      if (action === "ban" || action === "suspend") {
        const banExpiresAt = action === "suspend" ? banUntil : undefined;
        expectedStateRef.current = { banned: true, ban_expires_at: banExpiresAt };
        setProfile((prev) => ({
          ...prev,
          users: { banned: true, ban_reason: reason || `Admin ${action}`, ban_expires_at: banExpiresAt },
        }));
      } else if (action === "unban") {
        expectedStateRef.current = { banned: false, ban_expires_at: undefined };
        setProfile((prev) => ({
          ...prev,
          users: { banned: false, ban_reason: undefined, ban_expires_at: undefined },
        }));
      } else if (action === "verify") {
        setProfile((prev) => ({ ...prev, verified: true }));
      }

      toast.success("Success", {
        description: `User ${action === 'verify' ? 'verified' : action + 'ed'} successfully`,
      });

      setTimeout(() => {
        router.refresh();
      }, 300);
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Action failed",
      });
    } finally {
      setIsLoading(false);
      setActionState({ type: null, open: false });
    }
  };

  const handleAddNote = async () => {
    if (!noteForm.note.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteForm.note }),
      });

      if (!res.ok) throw new Error("Failed to add note");

      toast.success("Success", {
        description: "Note added successfully",
      });

      const notesRes = await fetch(`/api/admin/users/${profile.id}/notes`);
      if (notesRes.ok) {
        const data = await notesRes.json();
        setNotes(data.notes || []);
      }

      setNoteForm({ note: "" });
      setActionState({ type: null, open: false });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to add note",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isBanned = profile.users?.banned === true;
  const isSuspended = isBanned && !!profile.users?.ban_expires_at;

  return (
    <div className="space-y-8 pb-12">

      {/* Identity Card Section */}
      <section className="space-y-8 max-w-full mx-auto mt-4">
        <GroupContainer className="shadow-none">
          <ListRow 
            icon={
              profile.profile_photo ? (
                <div className="h-10 w-10 rounded-full overflow-hidden border-none shadow-none flex-shrink-0">
                  <Avatar className="h-full w-full rounded-full">
                    <AvatarImage 
                      src={getFullImageUrl(profile.profile_photo)} 
                      alt={profile.name || "?"} 
                      className="object-cover" 
                    />
                    <AvatarFallback className="rounded-full bg-secondary text-gray-500 text-xs font-semibold">
                      {profile.name?.substring(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center shrink-0 border">
                  <UserIcon className="h-4 w-4 text-gray-500" />
                </div>
              )
            }
            label={profile.name || "Unknown User"}
            secondary={
              <div className="flex items-center gap-1 mt-0.5">
                {profile.email}
              </div>
            }
            trailing={
              <div className="flex items-center gap-4 hidden md:flex">
                <div>
                  <StatusBadge status={isBanned ? (isSuspended ? "Suspended" : "Banned") : (profile.deleted ? "Deleted" : "Active")} />
                </div>
              </div>
            }
            showChevron={false}
            className="hover:bg-card active:bg-card cursor-default"
          />

          {/* Mobile Actions Block */}
          <div className="border-none p-3 pt-4 pb-4 w-full flex flex-col md:flex-row items-stretch md:items-center gap-2 overflow-x-auto no-scrollbar">
            {!profile.verified && (
              <Button
                variant="outline" 
                onClick={() => handleAction("verify")}
                className="w-full md:flex-1 rounded-lg !h-9 shadow-none"
              >
                Verify
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setActionState({ type: "note", open: true })}
              className={cn("w-full md:flex-1 rounded-lg !h-9 shadow-none", actionState.type === "note" && "bg-secondary")}
            >
              Add Note
            </Button>
            {!isBanned && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setActionState({ type: "warn", open: true })}
                  className="w-full md:flex-1 rounded-lg !h-9 shadow-none"
                >
                  Warn
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setActionState({ type: "suspend", open: true })}
                  className="w-full md:flex-1 rounded-lg !h-9 shadow-none"
                >
                  Suspend
                </Button>
                <Button
                  onClick={() => setActionState({ type: "ban", open: true })}
                  className="w-full md:flex-1 rounded-lg !h-9 shadow-none"
                >
                  Ban
                </Button>
              </>
            )}
            {isBanned && (
              <Button 
                variant="outline" 
                onClick={() => handleAction("unban")}
                className="w-full md:flex-1 rounded-lg !h-9 shadow-none"
              >
                {isSuspended ? "Unsuspend" : "Unban"}
              </Button>
            )}
          </div>
        </GroupContainer>
      </section>

      <div className="space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-12 space-y-10">

            <div className="grid grid-cols-1 gap-10">
              {/* Closed Beta Operations */}
              <section>
                <SectionHeader>Closed Beta Operations</SectionHeader>
                <GroupContainer>
                  <ListRow 
                    label="Beta Status" 
                    trailing={
                      <StatusBadge status={
                        profile.users?.beta_status === "activated" ? "Activated" : 
                        profile.users?.beta_status === "invited" ? "Invited" : "Not Invited"
                      } />
                    } 
                    showChevron={false} 
                  />
                  {profile.users?.invite_date && (
                    <ListRow 
                      label="Invited On" 
                      trailing={<span className="font-medium text-sm text-muted-foreground">{new Date(profile.users.invite_date).toLocaleString()}</span>} 
                      showChevron={false} 
                    />
                  )}
                  {profile.users?.activation_date && (
                    <ListRow 
                      label="Activated On" 
                      trailing={<span className="font-medium text-sm text-muted-foreground">{new Date(profile.users.activation_date).toLocaleString()}</span>} 
                      showChevron={false} 
                    />
                  )}
                  <ListRow 
                    label="Feedback Submitted" 
                    trailing={<span className="font-medium text-sm text-muted-foreground">{feedbackCount}</span>} 
                    showChevron={false} 
                  />
                </GroupContainer>
              </section>

              {/* Profile Details */}
              <section>
                <SectionHeader>Personal Details</SectionHeader>
                <GroupContainer>
                  <ListRow 
                    label="Account Status"
                    trailing={<StatusBadge status={isBanned ? (isSuspended ? "Suspended" : "Banned") : (profile.deleted ? "Deleted" : "Active")} />}
                    showChevron={false}
                    className="flex md:hidden" 
                  />
                  <ListRow label="Username" trailing={<span className="font-medium text-sm">@{profile.username}</span>} showChevron={false} />
                  {profile.birthday && <ListRow label="Birthday" trailing={<span className="font-medium text-sm">{new Date(profile.birthday).toLocaleDateString()}</span>} showChevron={false} />}
                  <ListRow label="Age" trailing={<span className="font-medium text-sm">{profile.age}</span>} showChevron={false} />
                  <ListRow label="Gender" trailing={<span className="font-medium text-sm">{profile.gender}</span>} showChevron={false} />
                  <ListRow label="Nationality" trailing={<span className="font-medium text-sm">{profile.nationality}</span>} showChevron={false} />
                  {profile.job && <ListRow label="Occupation" trailing={<span className="font-medium text-sm">{profile.job}</span>} showChevron={false} />}
                  {profile.religion && <ListRow label="Religion" trailing={<span className="font-medium text-sm">{profile.religion}</span>} showChevron={false} />}
                  {profile.smoking && <ListRow label="Smoking" trailing={<span className="font-medium text-sm">{profile.smoking}</span>} showChevron={false} />}
                  {profile.drinking && <ListRow label="Drinking" trailing={<span className="font-medium text-sm">{profile.drinking}</span>} showChevron={false} />}
                </GroupContainer>
              </section>

              {/* Preferences & Bio */}
              <section>
                <SectionHeader>Bio & Preferences</SectionHeader>
                <GroupContainer>
                  <ListRow 
                    label="Bio" 
                    secondary={profile.bio || "No bio provided"} 
                    showChevron={false}
                  />
                  <ListRow 
                    label="Personality" 
                    secondary={profile.personality || "Not specified"} 
                    showChevron={false}
                  />
                  {profile.food_preference && (
                    <ListRow 
                      label="Food Preference" 
                      secondary={profile.food_preference} 
                      showChevron={false}
                    />
                  )}
                  {profile.location && (
                    <ListRow 
                      label="Location" 
                      secondary={profile.location} 
                      showChevron={false}
                    />
                  )}
                  {profile.languages && (
                    <ListRow 
                      label="Languages" 
                      secondary={profile.languages.join(", ")} 
                      showChevron={false}
                    />
                  )}
                  {profile.interests && (
                    <ListRow 
                      label="Interests" 
                      secondary={profile.interests.join(", ")} 
                      showChevron={false}
                    />
                  )}
                </GroupContainer>
              </section>

              {/* Contact Details */}
              <section>
                <SectionHeader>Contact Information</SectionHeader>
                <GroupContainer>
                  <ListRow 
                    label="Email Address" 
                    secondary={profile.email} 
                    showChevron={false}
                  />
                  {profile.number && (
                    <ListRow 
                      label="Phone Number" 
                      secondary={profile.number} 
                      showChevron={false}
                    />
                  )}
                </GroupContainer>
              </section>
            </div>

            {/* Flags & History */}
            {flags.length > 0 && (
              <section>
                <SectionHeader>User Flags ({flags.length})</SectionHeader>
                <GroupContainer>
                  {flags.map((flag) => (
                    <ListRow
                      key={flag.id}
                      onClick={() => router.push(`/flags?flagId=${flag.id}`)}
                      icon={<ShieldAlert className={cn("h-5 w-5", flag.status === 'pending' ? 'text-orange-500' : 'text-muted-foreground')} />}
                      label={flag.type}
                      secondary={flag.reason}
                      trailing={
                        <div className="flex flex-col items-end">
                          <StatusBadge status={flag.status} />
                        </div>
                      }
                      showChevron={false}
                    />
                  ))}
                </GroupContainer>
              </section>
            )}

            {/* Admin Internal History */}
            {notes.length > 0 && (
              <section>
                <SectionHeader>Moderation History</SectionHeader>
                <GroupContainer>
                  {notes.map((note) => {
                    const isExpanded = expandedNotes.has(note.id);
                    const adminEmail = note.admins?.email?.split('@')[0] || "System";
                    
                    return (
                      <React.Fragment key={note.id}>
                        <ListRow
                          onClick={() => toggleNoteExpansion(note.id)}
                          icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                          label={note.reason.length > 40 ? `${note.reason.substring(0, 40)}...` : note.reason}
                          secondary={`${adminEmail} • ${new Date(note.created_at).toLocaleString()}`}
                          trailing={
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                          }
                          showChevron={false}
                          className={cn("transition-colors", isExpanded && "bg-card")}
                        />
                        {isExpanded && (
                          <div className="px-6 py-5 bg-card border-b border-border space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                             <div className="space-y-1">
                               <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Comment</span>
                               <p className="text-sm text-muted-foreground leading-relaxed">{note.reason}</p>
                             </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </GroupContainer>
              </section>
            )}

            {/* Technical Sessions */}
            {initialSessions.length > 0 && (
              <section>
                <SectionHeader>Active System Sessions</SectionHeader>
                <GroupContainer>
                  {initialSessions.map((session, idx) => (
                    <div key={idx} className="p-4 border-b border-border/40 last:border-0 hover:bg-card transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-mono font-medium text-muted-foreground line-clamp-1">{session.key}</span>
                      </div>
                      <pre className="text-sm bg-card p-4 rounded-xl overflow-x-auto text-muted-foreground scrollbar-hide">
                        {JSON.stringify(session.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </GroupContainer>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Action Dialogs */}
      {actionState.type === "warn" && (
        <ConfirmDialog
          open={actionState.open}
          onOpenChange={(open) => setActionState({ type: open ? "warn" : null, open })}
          title="Warn User"
          description="Send a warning to this user. This will be logged and they will receive an email."
          confirmText="Send Warning"
          validate={() => !!warnForm.reason.trim()}
          onConfirm={() => handleAction("warn", warnForm.reason)}
        >
          <div className="space-y-4 mt-4">
            <Label htmlFor="warn-reason">Warning Message</Label>
            <Textarea
              id="warn-reason"
              value={warnForm.reason}
              onChange={(e) => setWarnForm({ reason: e.target.value })}
              placeholder="Reason for warning (sent to user)"
              className="w-full min-h-[100px] rounded-lg"
            />
          </div>
        </ConfirmDialog>
      )}

      {actionState.type === "suspend" && (
        <ConfirmDialog
          open={actionState.open}
          onOpenChange={(open) => setActionState({ type: open ? "suspend" : null, open })}
          title="Suspend User"
          description="Temporarily suspend this user. They will be unable to access the platform until the suspension expires."
          confirmText="Suspend"
          validate={() => !!suspendForm.reason.trim() && !!suspendForm.banUntil}
          onConfirm={() => handleAction("suspend", suspendForm.reason, suspendForm.banUntil)}
        >
          <div className="space-y-4 mt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="suspend-reason">Reason</Label>
              <Input
                id="suspend-reason"
                value={suspendForm.reason}
                onChange={(e) => setSuspendForm({ ...suspendForm, reason: e.target.value })}
                placeholder="Reason for suspension"
                className="mt-1 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="suspend-until">Suspension Expires</Label>
              <Input
                id="suspend-until"
                type="datetime-local"
                value={suspendForm.banUntil}
                onChange={(e) => setSuspendForm({ ...suspendForm, banUntil: e.target.value })}
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
        </ConfirmDialog>
      )}

      {actionState.type === "ban" && (
        <ConfirmDialog
          open={actionState.open}
          onOpenChange={(open) => setActionState({ type: open ? "ban" : null, open })}
          title="Ban User"
          description="Permanently ban this user. This action cannot be undone easily."
          confirmText="Ban"
          requireTypedConfirmation={{ text: "BAN", placeholder: "Type BAN to confirm" }}
          onConfirm={() => handleAction("ban", banForm.reason)}
        >
          <div className="space-y-4 mt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ban-reason">Reason</Label>
              <Input
                id="ban-reason"
                value={banForm.reason}
                onChange={(e) => setBanForm({ reason: e.target.value })}
                placeholder="Reason for ban"
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
        </ConfirmDialog>
      )}

      {actionState.type === "note" && (
        <ConfirmDialog
          open={actionState.open}
          onOpenChange={(open) => setActionState({ type: open ? "note" : null, open })}
          title="Add Internal Note"
          description="Add a private administrative note about this user. This note is only visible to other admins."
          confirmText="Save Note"
          validate={() => !!noteForm.note.trim()}
          onConfirm={handleAddNote}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-note">Internal Note</Label>
              <Textarea
                id="admin-note"
                value={noteForm.note}
                onChange={(e) => setNoteForm({ note: e.target.value })}
                placeholder="Enter private note about this user..."
                className="w-full min-h-[100px] rounded-lg"
              />
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
