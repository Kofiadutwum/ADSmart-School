import { NextResponse, type NextRequest } from "next/server";
import { backendUrl, isBackendPath, signedHeaders } from "@/lib/forward";
import { routeFor } from "@/lib/hosts";

const djangoOrigin = () => process.env.DJANGO_ORIGIN ?? "http://127.0.0.1:8000";

/** Serves every school, the platform site and the admin area from one app (amendment §2.4), and
 * hands the API and media to Django (Plan 6A). */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isBackendPath(pathname)) {
    return NextResponse.rewrite(backendUrl(djangoOrigin(), pathname, search), {
      request: { headers: signedHeaders(request.headers, process.env.PROXY_SECRET ?? "") },
    });
  }
  if (pathname.startsWith("/api/")) return NextResponse.next(); // Next.js's own routes
  const target = routeFor(request.headers.get("host") ?? "", pathname, process.env.PLATFORM_DOMAIN ?? "localhost");
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next.js's own files.
  matcher: ["/((?!_next/).*)"],
};
