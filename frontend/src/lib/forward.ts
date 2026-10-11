/** How the website hands requests to Django (Plan 6A). Vercel may replace X-Forwarded-* between
 * two projects, so the visitor's address and IP also travel in headers signed with
 * PROXY_SECRET, which Django trusts only with the right secret (apps.core.forwarding). */

const SIGNED = ["x-site-host", "x-site-client-ip", "x-proxy-secret"];

export function isBackendPath(pathname: string): boolean {
  if (pathname === "/api/revalidate") return false; // answered by Next.js itself
  return pathname.startsWith("/api/") || pathname.startsWith("/media/");
}

export function backendUrl(origin: string, pathname: string, search: string): string {
  return `${origin.replace(/\/+$/, "")}${pathname}${search}`;
}

export function signedHeaders(incoming: Headers, secret: string): Headers {
  const headers = new Headers(incoming);
  for (const name of SIGNED) headers.delete(name); // never pass on ones a visitor made up
  const host = incoming.get("host") ?? "";
  headers.set("x-forwarded-host", host);
  if (secret) {
    const clientIp = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip") || "";
    headers.set("x-site-host", host);
    if (clientIp) headers.set("x-site-client-ip", clientIp);
    headers.set("x-proxy-secret", secret);
  }
  return headers;
}
