import { NextRequest, NextResponse } from "next/server";
import { processPendingOfflineEmails } from "@/services/messaging/chatNotificationService";

/**
 * GET /api/cron/send-offline-emails
 * Checks and delivers pending consolidated offline messages.
 * Secure with Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingOfflineEmails();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[cron/send-offline-emails] Processing failed:", err);
    return NextResponse.json(
      { error: "Failed to process offline emails", details: err.message },
      { status: 500 }
    );
  }
}
