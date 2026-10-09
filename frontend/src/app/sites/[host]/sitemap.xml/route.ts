import { getNewsList, getSite } from "@/lib/api";

type Context = { params: Promise<{ host: string }> };

export const revalidate = 3600;

const PAGES = ["", "/about", "/levels", "/admissions", "/news", "/contact", "/privacy"];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function GET(_request: Request, { params }: Context) {
  const { host } = await params;
  const site = await getSite(host);
  const base = site.school.base_url;
  const entries: { loc: string; lastmod?: string }[] = [];
  if (site.is_public) {
    entries.push(...PAGES.map((path) => ({ loc: `${base}${path}` })));
    const news = await getNewsList(host, 50);
    entries.push(...news.map((post) => ({ loc: `${base}/news/${post.slug}`, lastmod: post.published_at })));
  }
  const urls = entries
    .map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
