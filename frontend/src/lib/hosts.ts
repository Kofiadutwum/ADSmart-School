/** Which internal route tree serves a web address (amendment §2.1, §2.4). */

const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml"]);
const HAS_EXTENSION = /\.[a-z0-9]+$/i;
const NAMESPACE = /^\/(?:sites\/[^/]+|platform-site|platform-admin)(?=\/|$)/;

export function hostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** The internal path for a request, or null to leave it as it is. */
/** `adminHost`: the admin area's address until the platform has its own domain (Plan 6A). */
export function routeFor(rawHost: string, pathname: string, platformDomain: string, adminHost = ""): string | null {
  const host = hostname(rawHost);
  const root = platformDomain.toLowerCase();
  const base =
    host === root || host === `www.${root}`
      ? "/platform-site"
      : host === `admin.${root}` || (adminHost !== "" && host === adminHost.toLowerCase())
        ? "/platform-admin"
        : `/sites/${host}`;
  if (pathname === base || pathname.startsWith(`${base}/`)) return null; // this site's own URL
  if (NAMESPACE.test(pathname)) return `${base}/not-found`; // never another site's pages here
  if (pathname === "/unavailable") return null;
  if (HAS_EXTENSION.test(pathname) && !SEO_FILES.has(pathname)) return null; // shared files
  return pathname === "/" ? base : `${base}${pathname}`;
}

/** The address-bar path without the internal prefix, the same on server and client. */
export function publicPath(pathname: string): string {
  return pathname.replace(NAMESPACE, "") || "/";
}
