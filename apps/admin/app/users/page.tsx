import { requireAdmin } from "@/admin-lib/adminAuth";
import { supabaseAdmin } from "@kovari/api";
import { revokeExpiredSuspensions } from "@/admin-lib/revokeExpiredSuspensions";
import { AdminUsersTable } from "../../components/AdminUsersTable";

interface User {
  id: string;
  user_id: string;
  name: string | null;
  username: string | null;
  email: string;
  profile_photo?: string;
  verified: boolean;
  deleted?: boolean;
  flag_count: number;
  created_at: string;
  users?: {
    banned: boolean;
    ban_reason?: string;
    ban_expires_at?: string;
  };
}

async function getUsers(
  page: number = 1,
  limit: number = 20,
  query?: string,
  status?: string,
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ users: User[]; page: number; limit: number }> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let base = supabaseAdmin.from("profiles").select(
    `
      id,
      user_id,
      name,
      username,
      email,
      age,
      gender,
      nationality,
      verified,
      deleted,
      smoking,
      drinking,
      profile_photo,
      created_at,
      users${status && status !== 'deleted' ? '!inner' : ''}!profiles_user_id_fkey(
        banned,
        ban_reason,
        ban_expires_at,
        activation_date
      )
    `
  );

  if (query) {
    base = base.or(`name.ilike.%${query}%,username.ilike.%${query}%`);
  }

  if (status === "active") {
    base = base.eq("deleted", false).filter("users.banned", "eq", false);
  } else if (status === "deleted") {
    base = base.eq("deleted", true);
  } else if (status === "banned") {
    base = base.filter("users.banned", "eq", true).filter("users.ban_expires_at", "is", null);
  } else if (status === "suspended") {
    base = base.filter("users.banned", "eq", true).filter("users.ban_expires_at", "gt", new Date().toISOString());
  }

  base = base.order("created_at", { ascending: sortOrder === "asc" });

  const { data, error } = await base.range(from, to);

  if (error) {
    console.error("Error fetching profiles:", error);
    throw new Error("Failed to fetch users");
  }

  // Fetch flag counts for each user
  const userIds = (data as any[])?.map((user: any) => user.user_id).filter(Boolean) || [];
  const flagCounts: Record<string, number> = {};

  if (userIds.length > 0) {
    const { data: flagsData } = await supabaseAdmin
      .from("user_flags")
      .select("user_id")
      .in("user_id", userIds);

    if (flagsData) {
      (flagsData as any[]).forEach((flag) => {
        flagCounts[flag.user_id] = (flagCounts[flag.user_id] || 0) + 1;
      });
    }
  }

  // Add flag_count to each user
  const usersWithFlags =
    (data as any[])?.map((user: any) => ({
      ...user,
      flag_count: flagCounts[user.user_id] || 0,
      users:
        Array.isArray(user.users) && user.users.length > 0
          ? user.users[0]
          : undefined,
    })) || [];

  return {
    page,
    limit,
    users: usersWithFlags,
  };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; query?: string; status?: string; sortOrder?: string }>;
}) {
  await requireAdmin();

  // Check and revoke expired suspensions before loading users
  await revokeExpiredSuspensions();

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = 20;
  const query = params.query || "";
  const status = params.status || "";
  const sortOrder = (params.sortOrder || "desc") as "asc" | "desc";

  const { users, page: currentPage } = await getUsers(page, limit, query, status, sortOrder);

  return (
    <div className="max-w-full mx-auto space-y-6">
      <div className="space-y-0">
        <h1 className="text-lg font-semibold tracking-tight">Users</h1>
        <p className="text-md text-muted-foreground">
          Manage and monitor user accounts
        </p>
      </div>

      <AdminUsersTable
        initialUsers={users}
        initialPage={currentPage}
        initialLimit={limit}
        initialQuery={query}
        initialStatus={status}
        initialSortOrder={sortOrder}
      />
    </div>
  );
}

