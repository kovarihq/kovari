"use client";
import { getUserUuidByClerkId } from "@kovari/api/client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter, useParams } from "next/navigation";
import { Input } from "@/shared/components/ui/input";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { Badge } from "@/shared/components/ui/badge";
import { Spinner } from "@heroui/react";
import { Search, Check, CheckCheck, User } from "lucide-react";
import { X } from "lucide-react";
import { BsImage } from "react-icons/bs";
import { BsCameraVideoFill } from "react-icons/bs";
import {
  useDirectInbox,
  Conversation as BaseConversation,
} from "@/shared/hooks/use-direct-inbox";
import InboxChatListSkeleton from "./inbox-chat-list-skeleton";
import { getSocket } from "@/lib/socket";

/**
 * Format last message time like WhatsApp/Telegram: Today (time only),
 * Yesterday (with time), day name for this week, or date for older.
 */
function formatChatTimestamp(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (date >= todayStart) {
    return timeStr;
  }
  if (date >= yesterdayStart) {
    return `Yesterday, ${timeStr}`;
  }
  if (date >= weekAgo) {
    const dayName = date.toLocaleDateString([], { weekday: "short" });
    return `${dayName}, ${timeStr}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    const shortDate = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    return `${shortDate}, ${timeStr}`;
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface UserProfile {
  name?: string;
  username?: string;
  profile_photo?: string;
  deleted?: boolean;
}

interface InboxProps {
  activeUserId?: string;
}

// Extend Conversation type to include lastMediaType for local UI state
type Conversation = BaseConversation & { lastMediaType?: string };

export default function Inbox({ activeUserId }: InboxProps) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [currentUserUuid, setCurrentUserUuid] = useState<string>("");
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSearch = () => {
    // Filtering is already live, but this can be used for analytics or focus/blur
    // Optionally, you could debounce or only filter on button click
  };
  const handleClearSearch = () => {
    setSearchQuery("");
    inputRef.current?.focus();
  };
  const inbox = useDirectInbox(currentUserUuid);
  // Use only inbox.conversations as the source of truth

  useEffect(() => {
    if (!user?.id) return;
    getUserUuidByClerkId (user.id).then((uuid) =>
      setCurrentUserUuid(uuid || ""),
    );
  }, [user?.id]);

  useEffect(() => {
    if (!inbox.conversations.length) return;

    const fetchUserProfiles = async () => {
      const userIds = inbox.conversations.map((conv) => conv.userId);
      const response = await fetch("/api/direct-chat/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userIds }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const data = Array.isArray(payload?.profiles) ? payload.profiles : [];
      if (data.length > 0) {
        const profilesMap: Record<string, UserProfile> = {};
        data.forEach((profile: any) => {
          profilesMap[profile.user_id] = {
            name: profile.name,
            username: profile.username,
            profile_photo: profile.profile_photo,
            deleted: profile.deleted,
          };
        });
        setUserProfiles(profilesMap);
      }
    };

    fetchUserProfiles();
  }, [inbox.conversations]);

  useEffect(() => {
    const handler = (e: any) => {
      const { partnerId, message, createdAt, mediaType } = e.detail;
      setUserProfiles((prevProfiles) => ({ ...prevProfiles })); // force rerender if needed
      // Directly mutate inbox.conversations to add lastMediaType
      const conv = inbox.conversations.find(
        (c) =>
          c.userId === partnerId &&
          new Date(createdAt) > new Date(c.lastMessageAt),
      );
      if (conv) {
        (conv as any).lastMediaType = mediaType;
        conv.lastMessage = message;
        conv.lastMessageAt = createdAt;
      }
    };
    window.addEventListener("inbox-message-update", handler);
    return () => window.removeEventListener("inbox-message-update", handler);
  }, [inbox]);

  useEffect(() => {
    if (!user?.id || !currentUserUuid || inbox.conversations.length === 0) return;
    const socket = getSocket(user.id);
    if (!socket.connected) socket.connect();

    // Join all conversation rooms so we can receive their socket events (like typing)
    inbox.conversations.forEach(conv => {
       const chatId = currentUserUuid < conv.userId ? `${currentUserUuid}_${conv.userId}` : `${conv.userId}_${currentUserUuid}`;
       socket.emit("join_chat", { chatId });
    });

    const handleUserTyping = ({ chatId, userId }: any) => {
       if (userId === user.id) return;
       const partner = chatId.replace(currentUserUuid, "").replace("_", "");
       if (partner) setTypingUsers(prev => new Set(prev).add(partner));
    };

    const handleUserStoppedTyping = ({ chatId, userId }: any) => {
       const partner = chatId.replace(currentUserUuid, "").replace("_", "");
       if (partner) {
           setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(partner);
              return next;
           });
       }
    };

    const handleUserOnline = ({ supabaseId }: any) => {
       if (supabaseId) setOnlineUsers(prev => new Set(prev).add(supabaseId));
    };

    const handleUserOffline = ({ supabaseId }: any) => {
       if (supabaseId) setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(supabaseId);
          return next;
       });
    };

    socket.on("user_typing", handleUserTyping);
    socket.on("user_stopped_typing", handleUserStoppedTyping);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);

    return () => {
       socket.off("user_typing", handleUserTyping);
       socket.off("user_stopped_typing", handleUserStoppedTyping);
       socket.off("user_online", handleUserOnline);
       socket.off("user_offline", handleUserOffline);
    };
  }, [inbox.conversations, currentUserUuid, user?.id]);

  const handleConversationClick = (userId: string) => {
    // conversations.forEach(conv => {
    //   if (conv.userId === userId) {
    //     conv.unreadCount = 0; // Mark as read
    //   }
    // });
    // setConversations([...conversations]); // Force re-render to update unreadCount
    inbox.markConversationRead(userId);
    router.push(`/chat/${userId}`);
  };

  if (!currentUserUuid || inbox.loading) {
    return (
      <div className="h-full flex flex-col bg-card">
        {/* Search Bar */}
        <div className="p-3 bg-card flex-shrink-0 border-b border-border sticky top-0 z-50">
          <div className="relative">
            <input
              key="skeleton-search-input"
              type="text"
              placeholder="Search"
              className="w-full pl-4 pr-12 py-2 bg-secondary border-0 rounded-md text-muted-foreground placeholder:text-gray-400 text-sm placeholder:text-sm focus:outline-none"
              disabled
            />
            <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          </div>
        </div>
        <InboxChatListSkeleton />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Search Bar */}
      <div className="p-3 bg-card flex-shrink-0 border-b border-border sticky top-0 z-50">
        <div className="relative">
          <input
            key="active-search-input"
            type="text"
            placeholder="Search"
            className="w-full pl-4 pr-12 py-2 bg-secondary border-0 rounded-md text-muted-foreground placeholder:text-gray-400 text-sm placeholder:text-sm focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search conversations"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            ref={inputRef}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              tabIndex={0}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md focus:outline-none"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSearch}
              aria-label="Search"
              tabIndex={0}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md focus:outline-none"
            >
              <Search className="h-5 w-5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 min-h-0 bg-card overflow-y-auto scrollbar-hide">
        {(() => {
          if (inbox.conversations.length === 0) {
            return (
              <div className="flex items-center justify-center p-8 h-full">
                <span className="text-sm text-muted-foreground">
                  No conversations found.
                </span>
              </div>
            );
          }
          if (!inbox.loading && inbox.conversations.length === 0) {
            return (
              <div className="flex items-center justify-center p-8 h-full">
                <span className="text-muted-foreground">
                  No conversations yet.
                </span>
              </div>
            );
          }
          const filteredConversations = inbox.conversations.filter(
            (conversation) => {
              const profile = userProfiles[conversation.userId];
              const displayName =
                profile?.name || profile?.username || "Unknown";
              const username = profile?.username || "";
              const lastMessage = conversation.lastMessage || "";
              const query = searchQuery.trim().toLowerCase();
              if (!query) return true;
              return (
                displayName.toLowerCase().includes(query) ||
                username.toLowerCase().includes(query)
                // lastMessage.toLowerCase().includes(query)
              );
            },
          );
          if (
            !inbox.loading &&
            inbox.conversations.length > 0 &&
            filteredConversations.length === 0
          ) {
            return (
              <div className="flex items-center justify-center p-8 h-full">
                <span className="text-sm text-muted-foreground">
                  No conversations found.
                </span>
              </div>
            );
          }
          if (!inbox.loading && inbox.conversations.length === 0) {
            return (
              <div className="flex items-center justify-center p-8 h-full">
                <span className="text-muted-foreground">
                  No conversations yet.
                </span>
              </div>
            );
          }
          return filteredConversations.map((conversation, index) => {
            const profile = userProfiles[conversation.userId];
            const isDeleted = profile?.deleted === true;
            const displayName = isDeleted
              ? "Deleted User"
              : profile?.name || profile?.username || "Unknown";
            const time = formatChatTimestamp(conversation.lastMessageAt);
            const isActive = activeUserId === conversation.userId;
            const isInit = (conversation as any).lastMediaType === "init";

            return (
              <div
                key={conversation.userId}
                className={`flex items-center px-4 py-3  cursor-pointer transition-colors ${
                  index !== filteredConversations.length - 1
                    ? "border-b border-border"
                    : ""
                } ${isActive ? "bg-secondary" : "hover:bg-secondary"}`}
                onClick={() => handleConversationClick(conversation.userId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleConversationClick(conversation.userId);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open chat with ${displayName}`}
              >
                {/* Avatar */}
                <div
                  className={`relative mr-3 rounded-full ${isInit ? "ring-2 ring-primary ring-offset-2" : ""}`}
                >
                  <Avatar className="h-12 w-12 bg-secondary">
                    <AvatarImage
                      src={isDeleted ? "" : profile?.profile_photo || ""}
                      alt={displayName}
                    />
                    <UserAvatarFallback className="border border-border" />
                  </Avatar>
                  {onlineUsers.has(conversation.userId) && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-primary border-2 border-card" />
                  )}
                </div>

                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3
                      className={`text-sm font-semibold truncate ${
                        isActive ? "text-foreground" : "text-foreground"
                      }`}
                    >
                      {displayName}
                      {conversation.userId === currentUserUuid && (
                        <span className={"text-xs ml-1"}>(You)</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {time}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs truncate pr-2 flex flex-row items-center ${
                        isActive ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {typingUsers.has(conversation.userId) ? (
                         <span className="text-primary">typing...</span>
                      ) : (conversation as any).lastMediaType === "image" ? (
                        <>
                          <span role="img" aria-label="Photo" className="mr-1">
                            <BsImage className="h-3 w-3" />
                          </span>
                          <span>Photo</span>
                        </>
                      ) : (conversation as any).lastMediaType === "video" ? (
                        <>
                          <span role="img" aria-label="Video" className="mr-1">
                            <BsCameraVideoFill className="h-3 w-3" />
                          </span>
                          <span>Video</span>
                        </>
                      ) : (conversation as any).lastMediaType === "init" || conversation.lastMessage === "[Encrypted message]" ? (
                        <span className="font-medium text-primary">
                          Start a conversation!
                        </span>
                      ) : (
                        conversation.lastMessage
                      )}
                    </p>
                    {conversation.unreadCount > 0 && !isActive && (
                      <Badge
                        className="bg-primary text-primary-foreground text-xs min-w-[20px] h-4 rounded-full flex items-center justify-center ml-2"
                        aria-label={`${conversation.unreadCount} unread messages`}
                        tabIndex={0}
                      >
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

