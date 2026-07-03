import { ImageResponse } from "next/og";
import { SITE_LOGO_FALLBACK_PATH } from "@/lib/config/site";

// Route segment config
export const runtime = "edge";

// Image metadata
export const alt = "Kovari - Connect with Travelers";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  const logoData = await fetch(
    new URL(`../../public${SITE_LOGO_FALLBACK_PATH}`, import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb", // dev-theme background
          color: "#1c1c1e", // dev-theme foreground
          fontFamily: "Inter, sans-serif",
          position: "relative",
        }}
      >
        {/* Centered Logo Container */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%",
          }}
        >
          {/* Logo High-Res ArrayBuffer */}
          <img
            src={logoData as any}
            alt="Kovari Logo"
            width={800}
            height={165}
            style={{ objectFit: 'contain' }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

