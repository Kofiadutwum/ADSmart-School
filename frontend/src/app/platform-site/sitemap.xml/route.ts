import { getPlatform } from "@/lib/api";

export const revalidate = 3600;

export async function GET() {
  const platform = await getPlatform();
  const urls = platform.is_public
    ? ["", "/privacy"].map((path) => `  <url><loc>${platform.url}${path}</loc></url>`).join("\n")
    : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
