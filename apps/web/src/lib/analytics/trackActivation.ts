/**
 * 📊 Analytics Utility for Activation Funnel Tracking
 * Integrates directly with Kovari's existing analytics architecture (/api/analytics/track).
 */

const trackedEventsCache = new Set<string>();

export interface ActivationEventMetadata {
  userId?: string | null;
  authProvider?: string | null;
  sessionId?: string | null;
  userType?: "new" | "existing" | string;
  [key: string]: any;
}

export type ActivationFunnelEvent =
  | "activation_modal_shown"
  | "profile_picture_completed"
  | "travel_intention_completed"
  | "activation_completed";

/**
 * Tracks an activation funnel event with metadata while preventing duplicates.
 */
export async function trackActivationEvent(
  eventName: ActivationFunnelEvent,
  metadata: ActivationEventMetadata = {},
  dedupeKey?: string
) {
  // Deduplication guard to prevent duplicate events
  const key = dedupeKey || `${eventName}_${metadata.userId || "anon"}`;
  if (trackedEventsCache.has(key)) {
    return;
  }
  trackedEventsCache.add(key);

  const payload = {
    event_name: eventName,
    session_id: metadata.sessionId || null,
    event_data: {
      user_id: metadata.userId || null,
      auth_provider: metadata.authProvider || "unknown",
      timestamp: new Date().toISOString(),
      user_type: metadata.userType || "existing",
      ...metadata,
    },
  };

  try {
    if (typeof window !== "undefined") {
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.error(`[Analytics] Failed to track ${eventName}:`, err);
  }
}
