"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { GroupContainer } from "./ui/ios/GroupContainer";
import { ListRow } from "./ui/ios/ListRow";
import { SectionHeader } from "./ui/ios/SectionHeader";
import { SearchInput } from "./ui/ios/SearchInput";
import { StatusBadge } from "./ui/ios/StatusBadge";
import { getThumbnailUrl } from "../lib/cloudinary-client";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { User as UserIcon, MapPin, Calendar, AlertTriangle, Trash2, Eye, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
    beta_status?: "not_invited" | "invited" | "activated";
    invite_date?: string;
    activation_date?: string;
    beta_batch?: string;
    last_seen_at?: string;
  };
}

interface AdminUsersTableProps {
  initialUsers: User[];
  initialPage: number;
  initialLimit: number;
  initialQuery?: string;
  initialStatus?: string;
}

export function AdminUsersTable({
  initialUsers,
  initialPage,
  initialLimit,
  initialQuery = "",
  initialStatus = "",
}: AdminUsersTableProps) {
  const router = useRouter();
  const [users, setUsers] = React.useState<User[]>(initialUsers);
  const [page, setPage] = React.useState(initialPage);
  const [query, setQuery] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchUsers = React.useCallback(
    async (newPage: number, searchQuery: string, statusFilter: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: newPage.toString(),
          limit: initialLimit.toString(),
        });
        if (searchQuery) params.append("query", searchQuery);
        if (statusFilter) params.append("status", statusFilter);

        const res = await fetch(`/api/admin/users?${params}`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = await res.json();
        setUsers(data.users || []);
        setPage(newPage);

        const urlParams = new URLSearchParams({ page: newPage.toString() });
        if (searchQuery) urlParams.append("query", searchQuery);
        if (statusFilter) urlParams.append("status", statusFilter);
        router.push(`/users?${urlParams}`, { scroll: false });
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [initialLimit, router]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(page, query, status);
  };

  const handleStatusChange = (newStatus: string) => {
    const val = newStatus === "all" ? "" : newStatus;
    setStatus(val);
    fetchUsers(1, query, val);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Search & Filters */}
        <section className="space-y-6">
          <form onSubmit={handleSearch} className="">
            <SearchInput
              placeholder="Search users by name, username or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => {
                setQuery("");
                fetchUsers(1, "", status);
              }}
            />
            <button type="submit" className="hidden" />
          </form>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground ml-1">Status</label>
              <Select value={status || "all"} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full !h-10 rounded-xl bg-card border-border shadow-none cursor-pointer font-medium">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="invited">Invited (Beta)</SelectItem>
                  <SelectItem value="activated">Activated (Beta)</SelectItem>
                  <SelectItem value="not_invited">Non-Beta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Results List */}
        <section>
          <SectionHeader>User Directory {users.length > 0 && `(${users.length})`}</SectionHeader>
          <GroupContainer shadow={false}>
            {isLoading ? (
              <div className="h-[60vh] flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="h-[60vh] flex items-center justify-center text-muted-foreground text-sm font-medium">No users found</div>
            ) : (
              users.map((user) => {
                const statusElements = [];
                if (user.users?.banned) {
                  statusElements.push(user.users.ban_expires_at ? "Suspended" : "Banned");
                } else if (user.deleted) {
                  statusElements.push("Deleted");
                } else {
                  statusElements.push("Active");
                }

                const betaStatus = user.users?.beta_status || "not_invited";
                let betaLabel = "Not Invited";
                if (betaStatus === "invited") betaLabel = "Invited";
                if (betaStatus === "activated") betaLabel = "Activated";

                const cohort = user.users?.beta_batch
                  ? user.users.beta_batch.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                  : null;

                // Compute activity status from last_seen_at
                let activityStatus: string | null = null;
                if (user.users?.last_seen_at) {
                  const lastSeen = new Date(user.users.last_seen_at);
                  const now = Date.now();
                  const diffMs = now - lastSeen.getTime();
                  const diffDays = diffMs / (1000 * 60 * 60 * 24);
                  if (diffDays < 1) activityStatus = "Active Today";
                  else if (diffDays < 7) activityStatus = "Active This Week";
                  else activityStatus = "Inactive";
                }

                return (
                  <ListRow
                    key={user.id}
                    onClick={() => router.push(`/users/${user.id}`)}
                    icon={
                      user.profile_photo ? (
                        <div className="h-10 w-10 rounded-full overflow-hidden truncate border-none shadow-none flex-shrink-0">
                          <Avatar className="h-full w-full rounded-full">
                            <AvatarImage 
                              src={getThumbnailUrl(user.profile_photo)} 
                              alt={user.name || "User"} 
                              className="object-cover" 
                            />
                            <AvatarFallback className="rounded-full bg-secondary text-gray-500 text-sm font-semibold">
                              {user.name?.substring(0, 1).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      ) : (
                        <div className={cn(
                          "p-2 rounded-full h-10 w-10 flex items-center justify-center bg-secondary border border-border shrink-0",
                          user.deleted ? "opacity-30" : "text-gray-500"
                        )}>
                          <UserIcon className="h-4 w-4" />
                        </div>
                      )
                    }
                    label={user.name || "Unknown User"}
                    secondary={user.email}
                    trailing={
                      <div className="flex items-center gap-3">
                        {activityStatus && (
                          <StatusBadge status={activityStatus} />
                        )}
                        {cohort && (
                          <StatusBadge status={cohort} />
                        )}
                        {betaStatus !== "not_invited" && (
                          <StatusBadge status={betaLabel} />
                        )}
                        <StatusBadge status={statusElements[0] || "Active"} />
                      </div>
                    }
                    showChevron={false}
                  />
                );
              })
            )}
          </GroupContainer>
        </section>

        {/* Pagination Section */}
        {!isLoading && users.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-1 pt-0 pb-8">
            <p className="text-sm text-muted-foreground order-2 sm:order-1">
              Directory Page: <span className="font-semibold text-foreground">{page}</span>
            </p>
            <div className="flex items-center gap-3 order-1 sm:order-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchUsers(page - 1, query, status)} 
                disabled={page === 1}
                className="h-9 px-5 rounded-xl border-border bg-card shadow-none font-semibold hover:bg-secondary transition-all disabled:opacity-50 cursor-pointer"
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchUsers(page + 1, query, status)} 
                disabled={users.length < initialLimit}
                className="h-9 px-5 rounded-xl border-border bg-card shadow-none font-semibold hover:bg-secondary transition-all disabled:opacity-50 cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
