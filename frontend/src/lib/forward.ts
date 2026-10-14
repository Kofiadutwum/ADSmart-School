/** How the website hands requests to Django (Plan 6A). Vercel may replace X-Forwarded-* between
 * two projects, so the visitor's address and IP also travel in headers signed with
 * PROXY_SECRET, which Django trusts only with the right secret (apps.core.forwarding). */

const SIGNED = ["x-site-host", "x-site-client-ip", "x-proxy-secret"];

type Env = Record<string, string | undefined>;

/** Where Django runs. On Vercel it must be set (the Render address); without it every page would
 * try this computer's address and the build would fail with a puzzling connection error. */
export function djangoOrigin(env: Env = process.env): string {
  // Forgive the usual slips when pasting it: quotes, spaces, a missing https://, a trailing slash.
  let origin = env.DJANGO_ORIGIN?.trim().replace(/^["']+|["']+$/g, "").trim() ?? "";
  if (origin) {
    if (!/^https?:\/\//i.test(origin)) origin = `https://${origin}`;
    origin = origin.replace(/\/+$/, "");
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(
        "DJANGO_ORIGIN isn't a web address. In Vercel, set it to your Render backend's full address, " +
          "e.g. https://adsmartschool-api.onrender.com (docs/deploy/hosting.md, step 7).",
      );
    }
  }
  if (env.VERCEL) {
    throw new Error(
      "DJANGO_ORIGIN is not set. In Vercel, open Settings → Environment Variables and set it to your " +
        "Render backend address, e.g. https://adsmartschool-api.onrender.com (docs/deploy/hosting.md, step 7).",
    );
  }
  return "http://127.0.0.1:8000";
}

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
