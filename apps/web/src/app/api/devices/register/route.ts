import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { resolveUser } from "@/lib/auth/resolveUser";

export async function POST(request: NextRequest) {
  try {
    const authResult = await resolveUser(request, { mode: 'protected' });
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userUuid = authResult.user.userId;

    const body = await request.json();
    const { deviceId, fcmToken, platform, deviceName, appVersion } = body;

    if (!deviceId || !fcmToken || !platform) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    if (!['android', 'ios', 'web'].includes(platform)) {
      return NextResponse.json(
        { success: false, error: "Invalid platform value" },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();

    // 1. Delete any existing rows containing the same token to prevent unique token constraint violation
    await supabase
      .from("fcm_device_tokens")
      .delete()
      .eq("fcm_token", fcmToken);

    // 2. Upsert the token for this user/device mapping
    const { data, error } = await supabase
      .from("fcm_device_tokens")
      .upsert(
        {
          user_id: userUuid,
          device_id: deviceId,
          fcm_token: fcmToken,
          platform,
          device_name: deviceName || null,
          app_version: appVersion || null,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[Device Register] DB Error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[Device Register] Exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}
