import type { MetadataRoute } from "next";
import { getSite } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite();
  if (!site.is_public) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl()}/sitemap.xml` };
}
