"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { createClient } from "@kovari/api/client";
import { Notification } from "@kovari/types";
import { getSocket } from "@/lib/socket";
import { registerServiceWorker, subscribeUserToPush } from "@kovari/utils";
import { diagLog } from "@/lib/observability/performance";

interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  realtime?: boolean;
  activeChatId?: string | null; // Added: Suppress notifications for active chat
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { limit = 50, unreadOnly = false, realtime = true, activeChatId = null } = options;
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Deduplication cache: stores notification IDs or hashes for socket-delivered alerts
  const processedIds = useRef<Set<string>>(new Set());
  const processedFingerprints = useRef<Map<string, string>>(new Map()); // fingerprint -> notificationId
  const socketRef = useRef<any>(null);

  // Helper to generate a stable fingerprint for a notification
  const getFingerprint = (n: any) => {
    // For NEW_MESSAGE, use type + chatId
    // For others, use type + entityId
    const type = n.type || n.notification_type;
    const entityId = n.entity_id || n.chatId || n.entityId;
    const entityType = n.entity_type || n.entityType || "chat";
    
    // Normalize ID to string to avoid type mismatches
    const eId = String(entityId).toLowerCase().trim();
    
    // We use a broader fingerprint (type + entityId ONLY).
    // This ensures that any subsequent notification for the same chat/match/group
    // will correctly target and REPLACE the existing entry in the list, 
    // effectively "upgrading" a socket temp alert to a persistent DB record.
    return `${type}-${entityType}-${eId}`;
  };

  useEffect(() => {
    diagLog("useNotifications mounted");
  }, []);

  const fetchNotifications = useCallback(async (reason: string = "unknown") => {
    if (!user) return;

    try {
      setLoading(true);
      diagLog("Notifications fetch triggered");
      const start = performance.now();
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(unreadOnly && { unreadOnly: "true" }),
        reason,
      });

      const response = await fetch(`/api/notifications?${params}`);
      diagLog(`Notifications fetch completed in ${Math.round(performance.now() - start)}ms`);
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data = await response.json();
      const fetched = data.data?.notifications || data.notifications || [];
      
      // Seed deduplication caches
      fetched.forEach((n: Notification) => {
        processedIds.current.add(n.id);
        processedFingerprints.current.set(getFingerprint(n), n.id);
      });
      
      setNotifications(fetched);
    } catch (err: any) {
      setError(err.message || "Failed to load notifications");
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [user, limit, unreadOnly]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    try {
      diagLog("UnreadCount fetch triggered");
      const start = performance.now();
      const response = await fetch("/api/notifications/unread-count");
      diagLog(`UnreadCount fetch completed in ${Math.round(performance.now() - start)}ms`);
      if (!response.ok) {
        throw new Error("Failed to fetch unread count");
      }

      const data = await response.json();
      setUnreadCount(data.data?.count ?? data.count ?? 0);
    } catch (err: any) {
      console.error("Error fetching unread count:", err);
    }
  }, [user]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(`/api/notifications/${notificationId}`, {
          method: "PATCH",
        });

        if (!response.ok) {
          throw new Error("Failed to mark notification as read");
        }

        // Optimistically update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err: any) {
        console.error("Error marking notification as read:", err);
        fetchNotifications();
        fetchUnreadCount();
      }
    },
    [fetchNotifications, fetchUnreadCount]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read");
      }

      // Optimistically update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err: any) {
      console.error("Error marking all notifications as read:", err);
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [fetchNotifications, fetchUnreadCount]);

  // PHASE 4: Socket Integration
  useEffect(() => {
    if (!user) return;

    const socket = getSocket(user.id);
    socketRef.current = socket;

    socket.on("new_notification", (newNotif: any) => {
      // 1. Chat-Aware Logic: Ignore if user is in this active chat
      if (activeChatId && newNotif.chatId === activeChatId) {
        return;
      }

      // 2. Unified Deduplication Check
      const fingerprint = getFingerprint(newNotif);
      const existingId = processedFingerprints.current.get(fingerprint);

      const mappedNotif: Notification = {
        id: existingId || `temp-${Date.now()}`,
        user_id: user.id,
        type: newNotif.type,
        title: newNotif.title,
        message: newNotif.message,
        entity_type: "chat",
        entity_id: newNotif.chatId,
        is_read: false,
        created_at: newNotif.created_at || new Date().toISOString(),
        image_url: newNotif.image_url,
      };

      if (existingId) {
        // REPLACE existing temp/real notification with the latest content
        setNotifications((prev) => 
          prev.map((n) => n.id === existingId ? mappedNotif : n)
        );
        return; // Don't increment unread count again
      }

      // 3. Add to local state (instant update)
      processedIds.current.add(mappedNotif.id);
      processedFingerprints.current.set(fingerprint, mappedNotif.id);

      setNotifications((prev) => [mappedNotif, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    socket.on("unread_update", ({ count }: { count: number }) => {
      setUnreadCount(count);
    });

    return () => {
      socket.off("new_notification");
      socket.off("unread_update");
    };
  }, [user, activeChatId]);

  // PHASE 4: Web Push Registration
  useEffect(() => {
    if (!user) return;
    
    const initPush = async () => {
      await registerServiceWorker();
      await subscribeUserToPush();
    };

    initPush();
  }, [user]);

  // Existing Supabase Realtime Subscription
  useEffect(() => {
    if (!user || !realtime) return;

    const supabase = createClient();

    const setupRealtime = async () => {
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", user.id)
        .single();

      if (!userRow) return;

      const userId = userRow.id;

      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newNotification = payload.new as Notification;
            
            // 1. Check direct ID deduplication
            if (processedIds.current.has(newNotification.id)) return;
            processedIds.current.add(newNotification.id);

            // 2. Check fingerprint deduplication (to catch Socket vs Supabase overlap)
            const fingerprint = getFingerprint(newNotification);
            const existingId = processedFingerprints.current.get(fingerprint);

            if (existingId && existingId.startsWith("temp-")) {
              // Gracefully REPLACE the temp socket notification with the real DB record
              setNotifications((prev) => 
                prev.map((n) => n.id === existingId ? newNotification : n)
              );
              // Don't increment unreadCount because the temp one already did
            } else if (!existingId) {
              // This is a new notification (neither Socket nor DB handled it yet)
              processedFingerprints.current.set(fingerprint, newNotification.id);
              setNotifications((prev) => [newNotification, ...prev]);
              if (!newNotification.is_read) {
                setUnreadCount((prev) => prev + 1);
              }
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const updatedNotification = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === updatedNotification.id ? updatedNotification : n
              )
            );
            if (payload.old.is_read !== updatedNotification.is_read) {
              setUnreadCount((prev) =>
                updatedNotification.is_read ? Math.max(0, prev - 1) : prev + 1
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupRealtime();

    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [user, realtime]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications("mount");
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    loading,
    error,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refetch: () => fetchNotifications("manual_refresh"),
  };
}

