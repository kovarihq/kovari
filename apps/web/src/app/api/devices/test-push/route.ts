import { NextRequest, NextResponse } from "next/server";
import { firebaseAdmin } from "@/services/notifications/firebaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, title, body: pushBody } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: token" },
        { status: 400 }
      );
    }

    if (!firebaseAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase Admin is not configured. Please check environment variables.",
        },
        { status: 503 }
      );
    }

    const payload = {
      token: token,
      notification: {
        title: title || "Test Notification",
        body: pushBody || "This is a validation test from Kovari Backend",
      },
      data: {
        type: "TEST_PUSH",
        timestamp: new Date().toISOString(),
      },
    };

    const response = await firebaseAdmin.messaging().send(payload);

    return NextResponse.json({
      success: true,
      messageId: response,
      message: "Test push sent successfully.",
    });
  } catch (err: any) {
    console.error("[Test Push] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}
