import { notFound, redirect } from "next/navigation";
import type {
  ArticleKind,
  NewsPost,
  NewsSummary,
  PlatformArticle,
  PlatformArticleSummary,
  PlatformData,
  PrivacyNotice,
  SiteData,
} from "./types";

/** Public pages are rebuilt at most every five minutes (ISR). */
export const REVALIDATE_SECONDS = 300;

function djangoOrigin(): string {
  return process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";
}

/** `tags`: Django can refresh these straight away (the platform website; business tools §5.7). */
async function fetchJson<T>(path: string, tags?: string[]): Promise<T | null> {
  const response = await fetch(`${djangoOrigin()}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS, ...(tags && { tags }) },
  });
  if (response.status === 404) return null;
  if (response.status === 503 && ((await response.json()) as { code?: string }).code === "suspended") {
    redirect("/unavailable");
  }
  if (!response.ok) throw new Error(`Website API ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

const sitePath = (host: string) => `/api/public/sites/${encodeURIComponent(host)}`;

/** The school at this address. Unknown addresses show the not-found page. */
export async function getSite(host: string): Promise<SiteData> {
  return (await fetchJson<SiteData>(`${sitePath(host)}/site`)) ?? notFound();
}

export async function getNewsList(host: string, limit = 20): Promise<NewsSummary[]> {
  return (await fetchJson<NewsSummary[]>(`${sitePath(host)}/news?limit=${limit}`)) ?? [];
}

export async function getNewsPost(host: string, slug: string): Promise<NewsPost | null> {
  return fetchJson<NewsPost>(`${sitePath(host)}/news/${encodeURIComponent(slug)}`);
}

export async function getPrivacyNotice(host: string): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>(`${sitePath(host)}/privacy-notice`);
}

export function contentOf(site: SiteData, key: string, fallback = ""): string {
  return site.content[key] ?? fallback;
}

const PLATFORM_TAGS = ["platform"];

export async function getPlatform(): Promise<PlatformData> {
  const platform = await fetchJson<PlatformData>("/api/public/platform", PLATFORM_TAGS);
  if (!platform) throw new Error("Website API is missing /api/public/platform");
  return platform;
}

export async function getPlatformPrivacyNotice(): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>("/api/public/platform/privacy-notice", PLATFORM_TAGS);
}

/** shortcut: the newest 50; add paging when the owner has published more than that. */
export async function getPlatformArticles(kind?: ArticleKind): Promise<PlatformArticleSummary[]> {
  const query = kind ? `?kind=${kind}` : "";
  return (await fetchJson<PlatformArticleSummary[]>(`/api/public/platform/articles${query}`, PLATFORM_TAGS)) ?? [];
}

export async function getPlatformArticle(slug: string): Promise<PlatformArticle | null> {
  return fetchJson<PlatformArticle>(`/api/public/platform/articles/${encodeURIComponent(slug)}`, PLATFORM_TAGS);
}
