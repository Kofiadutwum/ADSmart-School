import type { MetadataRoute } from "next";
import { getNewsList, getSite } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 3600;

const PAGES = ["", "/about", "/levels", "/admissions", "/news", "/contact", "/privacy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSite();
  if (!site.is_public) return [];
  const base = siteUrl();
  const news = await getNewsList(50);
  return [
    ...PAGES.map((path) => ({ url: `${base}${path}` })),
    ...news.map((post) => ({ url: `${base}/news/${post.slug}`, lastModified: post.published_at })),
  ];
}
