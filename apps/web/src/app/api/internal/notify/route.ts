import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications/createNotification";
import { CreateNotificationParams } from "@kovari/types";

/**
 * Internal-only endpoint for the Socket.IO server to trigger push notifications.
 * Protected by a shared secret (INTERNAL_NOTIFY_SECRET) so it is never callable
 * by untrusted clients.
 *
 * POST /api/internal/notify
 * Headers: x-internal-secret: <INTERNAL_NOTIFY_SECRET>
 * Body: CreateNotificationParams JSON
 */
export async function POST(request: NextRequest) {
  // 1. Validate internal secret
  const secret = request.headers.get("x-internal-secret");
  const expectedSecret = process.env.INTERNAL_NOTIFY_SECRET;

  if (!expectedSecret) {
    console.error("[InternalNotify] INTERNAL_NOTIFY_SECRET env var is not set.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!secret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse and validate body
  let params: CreateNotificationParams;
  try {
    params = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!params.userId || !params.type || !params.title || !params.message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 3. Delegate to createNotification (handles DB write + FCM push)
  try {
    const result = await createNotification(params);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    console.error("[InternalNotify] Error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
