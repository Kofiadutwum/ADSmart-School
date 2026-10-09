import type { NewsPost, NewsSummary, PrivacyNotice, SiteData } from "./types";

/** Public pages are rebuilt at most every five minutes (ISR). */
export const REVALIDATE_SECONDS = 300;

function djangoOrigin(): string {
  return process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${djangoOrigin()}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Website API ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export async function getSite(): Promise<SiteData> {
  const site = await fetchJson<SiteData>("/api/public/site");
  if (!site) throw new Error("Website API is missing /api/public/site");
  return site;
}

export async function getNewsList(limit = 20): Promise<NewsSummary[]> {
  return (await fetchJson<NewsSummary[]>(`/api/public/news?limit=${limit}`)) ?? [];
}

export async function getNewsPost(slug: string): Promise<NewsPost | null> {
  return fetchJson<NewsPost>(`/api/public/news/${encodeURIComponent(slug)}`);
}

export async function getPrivacyNotice(): Promise<PrivacyNotice | null> {
  return fetchJson<PrivacyNotice>("/api/public/privacy-notice");
}

export function contentOf(site: SiteData, key: string, fallback = ""): string {
  return site.content[key] ?? fallback;
}
