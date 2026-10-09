import { ImageResponse } from "next/og";

export const alt = "AD Smart School, Kronom, Kumasi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview card for WhatsApp, Facebook and others (brand asset colours). */
export default function OpengraphImage() {
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
        <div style={{ fontSize: 34, fontWeight: 600, color: "#f0ad1c" }}>Kronom, Kumasi · Since 2001</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>AD Smart School</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>Bright beginnings, from Crèche to JHS</div>
      </div>
    ),
    size,
  );
}
