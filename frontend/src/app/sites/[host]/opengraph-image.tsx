import { ImageResponse } from "next/og";
import { contentOf, getSite } from "@/lib/api";

export const alt = "The school's website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview card for WhatsApp, Facebook and others, in the school's own colours. */
export default async function OpengraphImage({ params }: { params: Promise<{ host: string }> }) {
  const site = await getSite((await params).host);
  const brand = site.brand.light;
  const background = brand["--btn-primary"]
    ? `linear-gradient(135deg, ${brand["--mesh-a"]} 0%, ${brand["--mesh-b"]} 55%, ${brand["--mesh-c"]} 100%)`
    : "linear-gradient(135deg, #0f1a9e 0%, #0277bd 55%, #8806a8 100%)";
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
          background,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, color: brand["--brand-amber"] ?? "#f0ad1c" }}>
          {contentOf(site, "hero_subline")}
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>{site.school.name}</div>
        <div style={{ fontSize: 40, marginTop: 16 }}>{contentOf(site, "hero_headline")}</div>
      </div>
    ),
    size,
  );
}
