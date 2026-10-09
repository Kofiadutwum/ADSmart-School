import { getSite } from "@/lib/api";

type Context = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function GET(_request: Request, { params }: Context) {
  const site = await getSite((await params).host);
  const body = site.is_public
    ? `User-Agent: *\nAllow: /\n\nSitemap: ${site.school.base_url}/sitemap.xml\n`
    : "User-Agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
