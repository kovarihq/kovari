import { pubClient } from "./redis";
import { memorySets, memoryKV } from "./memoryStore";

/**
 * Enhanced presence tracker with Redis integration for cross-node tracking.
 * Maintains mapping `user_socket:{userId}` -> Set of active socket IDs.
 * Maintains mapping `user_chats:{userId}` -> Set of active chatIds for scoped presence emissions.
 */
export class PresenceManager {
  /**
   * Called when a user's socket connects
   */
  static async userConnected(userId: string, socketId: string) {
    if (!userId) return;
    try {
      const key = `user_socket:${userId}`;
      if (pubClient.isOpen) {
        await pubClient.sAdd(key, socketId);
      } else {
        await memorySets.sAdd(key, socketId);
      }
    } catch (err) {
      console.error("[Presence] Error syncing user connection:", err);
    }
  }

  /**
   * Called when a user maps dynamically to a chat interface. Scopes presence.
   */
  static async userJoinedChat(userId: string, chatId: string, emitOnlineToChat: (cId: string, uId: string) => void) {
      if (!userId || !chatId) return;
      try {
          const chatsKey = `user_chats:${userId}`;
          if (pubClient.isOpen) {
            await pubClient.sAdd(chatsKey, chatId);
          } else {
            await memorySets.sAdd(chatsKey, chatId);
          }
          
          // Emit strictly to this chat indicating the user is present in it
          emitOnlineToChat(chatId, userId);
      } catch (err) {}
  }

  /**
   * Called when a user gracefully unmounts a chat interface.
   */
  static async userLeftChat(userId: string, chatId: string) {
      if (!userId || !chatId) return;
      try {
          const chatsKey = `user_chats:${userId}`;
          if (pubClient.isOpen) {
            await pubClient.sRem(chatsKey, chatId);
          } else {
            await memorySets.sRem(chatsKey, chatId);
          }
      } catch (err) {}
  }

  /**
   * Called when a user's socket disconnects with grace-delay race-condition safety
   */
  static async userDisconnected(userId: string, socketId: string, emitOfflineToChat: (cId: string, uId: string, lastSeen: string) => void) {
    if (!userId) return;
    try {
      const socketKey = `user_socket:${userId}`;
      let count: number;
      
      if (pubClient.isOpen) {
        await pubClient.sRem(socketKey, socketId);
        count = await pubClient.sCard(socketKey);
      } else {
        await memorySets.sRem(socketKey, socketId);
        count = await memorySets.sCard(socketKey);
      }
      
      // If count hits exactly 0, trigger grace delay before flushing state globally
      if (count === 0) {
        setTimeout(async () => {
             let newCount: number;
             if (pubClient.isOpen) {
               newCount = await pubClient.sCard(socketKey);
             } else {
               newCount = await memorySets.sCard(socketKey);
             }

             if (newCount === 0) {
                  // They are truly offline across all browser tabs and mobile apps.
                  const chatsKey = `user_chats:${userId}`;
                  let activeChats: string[] = [];
                  
                  try {
                    if (pubClient.isOpen) {
                      activeChats = await pubClient.sMembers(chatsKey);
                    } else {
                      activeChats = await memorySets.sMembers(chatsKey);
                    }
                  } catch (_) {}

                  // Write lastSeen BEFORE emitting so clients can fetch it immediately
                  const nowISO = new Date().toISOString();
                  try {
                    if (pubClient.isOpen) {
                      await pubClient.set(`chat:lastSeen:${userId}`, nowISO);
                    } else {
                      await memoryKV.set(`chat:lastSeen:${userId}`, nowISO);
                    }
                  } catch (_) {}

                  const { createAdminSupabaseClient } = await import("@kovari/api");
                  const supabase = createAdminSupabaseClient();
                  const chatIds = new Set<string>();

                  try {
                    let supabaseId = userId;
                    if (userId.startsWith("user_")) {
                      const { data: userRow } = await supabase
                        .from("users")
                        .select("id")
                        .eq("clerk_user_id", userId)
                        .single();
                      if (userRow?.id) {
                        supabaseId = userRow.id;
                      }
                    }
                    
                    if (supabaseId) {
                      // Fetch direct conversations
                      const { data: conversations } = await supabase
                        .from("conversations")
                        .select("id, user_a_id, user_b_id")
                        .or(`user_a_id.eq.${supabaseId},user_b_id.eq.${supabaseId}`);
                      
                      // Fetch group memberships
                      const { data: groups } = await supabase
                        .from("group_memberships")
                        .select("group_id")
                        .eq("user_id", supabaseId)
                        .eq("status", "accepted");

                      if (conversations) {
                        conversations.forEach((c: any) => {
                          chatIds.add(`${c.user_a_id}_${c.user_b_id}`);
                        });
                      }
                      if (groups) {
                        groups.forEach((g: any) => chatIds.add(g.group_id));
                      }
                    }
                  } catch (err) {
                    console.error("[Presence] Error querying offline user conversations:", err);
                  }

                  // Also include any active chats currently in memory/redis
                  for (const cId of activeChats) {
                    chatIds.add(cId);
                  }

                  // Clean up presence
                  for (const chatId of chatIds) {
                      emitOfflineToChat(chatId, userId, nowISO);
                  }
                  
                  // Clear their active chats index
                  try {
                    if (pubClient.isOpen) {
                      await pubClient.del(chatsKey);
                    } else {
                      await memorySets.del(chatsKey);
                    }
                  } catch (_) {}
             }
        }, 1500); // 1.5 second debounced grace period
      }
    } catch (err) {
      console.error("[Presence] Error syncing user disconnection:", err);
    }
  }

  // Fetch last seen timestamp from Redis
  static async getLastSeen(userId: string): Promise<string | null> {
     try {
       const userSocketsKey = `user_socket:${userId}`;
       let count: number;
       
       if (pubClient.isOpen) {
         count = await pubClient.sCard(userSocketsKey);
       } else {
         count = await memorySets.sCard(userSocketsKey);
       }

       if (count && count > 0) return "online"; // currently online

       if (pubClient.isOpen) {
         return await pubClient.get(`chat:lastSeen:${userId}`);
       } else {
         return await memoryKV.get(`chat:lastSeen:${userId}`);
       }
     } catch (e) {
       console.error(`[PresenceManager] Error fetching last seen: ${e}`);
       return null;
     }
  }

  // Flush all stale socket presence data — call once on server startup
  static async flushStalePresence() {
    // Skip if Redis isn't connected (in-memory / offline dev mode)
    if (!pubClient.isOpen) {
      console.log("[Presence] Skipping stale flush — Redis not connected.");
      return;
    }
    try {
      const keys = await pubClient.keys("user_socket:*");
      if (keys.length > 0) {
        await pubClient.del(keys);
        console.log(`[Presence] Flushed ${keys.length} stale socket keys on startup`);
      }
      const chatKeys = await pubClient.keys("user_chats:*");
      if (chatKeys.length > 0) {
        await pubClient.del(chatKeys);
      }
    } catch (e) {
      console.error("[Presence] Error flushing stale presence:", e);
    }
  }
}
