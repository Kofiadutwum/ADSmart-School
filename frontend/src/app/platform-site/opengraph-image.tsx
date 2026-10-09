import { ImageResponse } from "next/og";
import { getPlatform } from "@/lib/api";

export const alt = "School websites for Ghana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const platform = await getPlatform();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          color: "#ffffff",
          background: "linear-gradient(135deg, #0f1a9e 0%, #0277bd 55%, #8806a8 100%)",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, color: "#f0ad1c" }}>{platform.name}</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>Your school, online</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>Websites and school systems for Ghana</div>
      </div>
    ),
    size,
  );
}
