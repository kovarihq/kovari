import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@kovari/api";

export async function GET(req: NextRequest) {
  try {
    // Removed auth check to allow public Explore page location search.
    // Rate limiting is still active via IP below.

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // 'autocomplete' or 'details'
    const query = searchParams.get("q");
    const placeId = searchParams.get("placeId");

    // Rate limit: 30 per minute
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const ratelimit = await checkRateLimit(`rate_limit:proxy:geoapify:${ip}`, 30, 60);
    if (!ratelimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (type === "autocomplete") {
      if (!query) return NextResponse.json({ features: [] });
      
      const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
      const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      url.searchParams.append("text", query);
      url.searchParams.append("limit", "7");
      url.searchParams.append("lang", "en");
      url.searchParams.append("apiKey", apiKey!);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      return NextResponse.json(data);
    } else if (type === "details") {
      if (!placeId) return NextResponse.json({ features: [] });
      const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
      const url = new URL("https://api.geoapify.com/v1/geocode/search");
      url.searchParams.append("id", placeId);
      url.searchParams.append("apiKey", apiKey!);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Geoapify proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

