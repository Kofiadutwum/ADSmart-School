import { getPlatform } from "@/lib/api";

export const revalidate = 300;

export async function GET() {
  const platform = await getPlatform();
  const body = platform.is_public
    ? `User-Agent: *\nAllow: /\n\nSitemap: ${platform.url}/sitemap.xml\n`
    : "User-Agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
