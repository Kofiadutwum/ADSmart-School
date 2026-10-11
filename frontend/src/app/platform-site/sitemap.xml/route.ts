import { getPlatform, getPlatformArticles } from "@/lib/api";

export const revalidate = 3600;

export async function GET() {
  const platform = await getPlatform();
  const articles = platform.is_public ? await getPlatformArticles() : [];
  const pages = platform.is_public
    ? ["", "/privacy", ...(articles.length ? ["/articles"] : []), ...(platform.gallery.length > 12 ? ["/gallery"] : [])]
    : [];
  const urls = [
    ...pages.map((path) => `  <url><loc>${platform.url}${path}</loc></url>`),
    ...articles.map(
      (article) =>
        `  <url><loc>${platform.url}/articles/${article.slug}</loc><lastmod>${article.published_at.slice(0, 10)}</lastmod></url>`,
    ),
  ].join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
