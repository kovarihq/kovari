import { requireAdmin } from "@/admin-lib/adminAuth";
import { supabaseAdmin } from "@kovari/api";
import { revokeExpiredSuspensionForUser } from "@/admin-lib/revokeExpiredSuspensions";
import { UserDetail } from "@/components/UserDetail";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";

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

async function getUserDetail(id: string): Promise<{
  profile: UserProfile;
  flags: Flag[];
  sessions: Array<{ key: string; data: unknown }>;
  feedbackCount: number;
} | null> {
  const profileId = id;

  // Get profile + banned state
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select(
      `
      id,
      user_id,
      name,
      username,
      email,
      number,
      age,
      birthday,
      gender,
      nationality,
      bio,
      job,
      location,
      religion,
      smoking,
      drinking,
      personality,
      food_preference,
      languages,
      interests,
      profile_photo,
      verified,
      deleted,
      users!profiles_user_id_fkey(
        banned,
        ban_reason,
        ban_expires_at,
        beta_status,
        invite_date,
        activation_date
      )
    `
    )
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    throw new Error("Failed to fetch user");
  }

  if (!profile) {
    return null;
  }

  // Fetch flags
  const { data: flags, error: flagsError } = await supabaseAdmin
    .from("user_flags")
    .select("*")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false });

  if (flagsError) {
    console.error("Error fetching user flags:", flagsError);
  }

  // Fetch user sessions from Redis
  const sessions: Array<{ key: string; data: unknown }> = [];
  try {
    const { redis, ensureRedisConnection } = await import("@kovari/api");
    await ensureRedisConnection();

    // Try to find sessions for this user
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("clerk_user_id")
      .eq("id", profile.user_id)
      .maybeSingle();

    if (userData?.clerk_user_id) {
      const sessionKeys = [
        `session:${userData.clerk_user_id}`,
        `session:user:${profile.user_id}`,
      ];

      for (const key of sessionKeys) {
        try {
          const sessionData = await redis.get(key);
          if (sessionData) {
            sessions.push({
              key,
              data: JSON.parse(sessionData),
            });
          }
        } catch {
          // Session not found or invalid, continue
        }
      }
    }
  } catch (e) {
    console.error("Error fetching user sessions:", e);
  }

  // Check and revoke expired suspension for this user
  if (profile.user_id) {
    await revokeExpiredSuspensionForUser(profile.user_id);
  }

  // Fetch feedback count
  let feedbackCount = 0;
  if (profile.user_id) {
    const { count } = await supabaseAdmin
      .from("feedback")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.user_id);
    feedbackCount = count || 0;
  }

  // Transform users relationship from array to object
  // Supabase returns foreign key relationships as arrays
  let usersData = undefined;
  if (Array.isArray(profile.users)) {
    usersData = profile.users.length > 0 ? profile.users[0] : undefined;
  } else if (profile.users && typeof profile.users === "object") {
    // Sometimes it might come as an object directly
    usersData = profile.users;
  }

  // If no users data found, fetch it directly
  if (!usersData && profile.user_id) {
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("banned, ban_reason, ban_expires_at, beta_status, invite_date, activation_date")
      .eq("id", profile.user_id)
      .maybeSingle();

    if (userRow) {
      usersData = {
        banned: userRow.banned ?? false,
        ban_reason: userRow.ban_reason ?? undefined,
        ban_expires_at: userRow.ban_expires_at ?? undefined,
        beta_status: userRow.beta_status ?? undefined,
        invite_date: userRow.invite_date ?? undefined,
        activation_date: userRow.activation_date ?? undefined,
      };
    }
  }

  return {
    profile: {
      ...profile,
      users: usersData,
    },
    flags: flags ?? [],
    sessions,
    feedbackCount,
  } as any;
}

async function getAdminNotes(id: string): Promise<{ notes: AdminNote[] }> {
  try {
    const profileId = id;

    // Get profile to get user_id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("id", profileId)
      .maybeSingle();

    if (!profile) {
      return { notes: [] };
    }

    // Fetch admin notes from admin_actions
    const { data: notes, error } = await supabaseAdmin
      .from("admin_actions")
      .select(
        `
        id,
        admin_id,
        action,
        reason,
        metadata,
        created_at,
        admins:admins!admin_actions_admin_id_fkey(
          email
        )
      `
      )
      .eq("target_type", "user")
      .eq("target_id", profile.user_id)
      .eq("action", "add_note")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching admin notes:", error);
      return { notes: [] };
    }

    const formattedNotes: AdminNote[] = (notes as any[] || []).map((note: any) => {
      const admin =
        Array.isArray(note.admins) && note.admins.length > 0
          ? note.admins[0]
          : undefined;

      return {
        id: String(note.id),
        reason: String(note.reason || ""),
        created_at: String(note.created_at),
        admins: admin ? { email: String(admin.email) } : undefined,
      };
    });

    return { notes: formattedNotes };
  } catch (error) {
    console.error("Error fetching admin notes:", error);
    return { notes: [] };
  }
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flagId?: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const { flagId } = await searchParams;
  const [userData, notesData] = await Promise.all([
    getUserDetail(id),
    getAdminNotes(id),
  ]);

  if (!userData || !userData.profile) {
    notFound();
  }

  return (
    <div className="max-w-full space-y-6">
      <div className="">
        <Link
          href="/users"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all group"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Users
        </Link>
      </div>

      <UserDetail
        profile={userData.profile}
        flags={userData.flags || []}
        sessions={userData.sessions || []}
        notes={notesData.notes}
        flagId={flagId}
        feedbackCount={userData.feedbackCount}
      />
    </div>
  );
}
