import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // Security check: Only allow Cloudinary URLs to prevent SSRF attacks
    if (!url.startsWith("https://res.cloudinary.com/")) {
      return NextResponse.json({ error: "Invalid host" }, { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch resource: ${response.statusText}` },
        { status: response.status }
      );
    }

    const buffer = await response.arrayBuffer();
    
    // Forward response headers or set as octet-stream
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Media proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
