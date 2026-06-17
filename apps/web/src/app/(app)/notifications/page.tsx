"use client";

import { useState } from "react";
import {
  Bell,
  ChevronRight,
  Check,
  UserPlus,
  Users,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import Link from "next/link";
import { useNotifications } from "@/shared/hooks/useNotifications";
import { Notification } from "@kovari/types";
import {
  getNotificationLink,
  getAvatarFallback,
  shouldShowPoolIcon,
} from "@kovari/utils";
import { formatNotificationTime } from "@kovari/utils";
import { Skeleton } from "@heroui/react";
import InboxChatListSkeleton from "@/shared/components/layout/inbox-chat-list-skeleton";
import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

export default function NotificationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const {
    notifications,
    loading,
    error,
    markAllAsRead,
    markAsRead,
    unreadCount,
  } = useNotifications({ limit: 100, unreadOnly: false, realtime: true });

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
  };

  const filteredNotifications = notifications.filter((notification) => {
    // Filter by search query if provided
    const matchesSearch =
      searchQuery === "" ||
      notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="h-screen w-full bg-card flex flex-col">
      {/* Mobile back nav */}
      <MobileBackNav
        title="Notifications"
        forceHref="/dashboard"
        rightSlot={
          <Button
            variant="ghost"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className="text-sm !px-0 text-primary font-medium hover:bg-transparent hover:text-primary focus-visible:border-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark all as read
          </Button>
        }
      />

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading ? (
          <InboxChatListSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Bell className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Bell className="w-5 h-5 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "No notifications match your search"
                : "No notifications"}
            </p>
          </div>
        ) : (
          <div>
            {filteredNotifications.map((notification) => {
              const notificationLink = getNotificationLink(notification);
              const avatarFallback = getAvatarFallback(notification);

              const isReport = notification.type === "REPORT_SUBMITTED";
              const isGroupInviteOrRequest =
                notification.type === "GROUP_INVITE_RECEIVED" ||
                notification.type === "GROUP_JOIN_REQUEST_RECEIVED";
              const isGroupApproved =
                notification.type === "GROUP_JOIN_APPROVED";

              // Determine if we should show a special icon instead of an avatar image
              const showGroupIconFallback =
                !notification.image_url &&
                (isGroupInviteOrRequest || isGroupApproved);

              return (
                <Link
                  key={notification.id}
                  href={notificationLink}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex items-start gap-3 p-4 transition-colors cursor-pointer border-b ${
                    !notification.is_read
                      ? "bg-secondary border-border"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {isReport ? (
                    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCheck className="w-5 h-5 text-green-600" />
                    </div>
                  ) : showGroupIconFallback ? (
                    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-secondary flex items-center justify-center">
                      {isGroupInviteOrRequest ? (
                        <UserPlus className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <Users className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  ) : (
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      <AvatarImage
                        src={notification.image_url || undefined}
                        alt={notification.title}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-secondary text-foreground text-xs font-semibold">
                        {avatarFallback}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                      {notification.created_at && (
                        <>
                          {" · "}
                          <span className="text-muted-foreground/80">
                            {formatNotificationTime(notification.created_at)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}