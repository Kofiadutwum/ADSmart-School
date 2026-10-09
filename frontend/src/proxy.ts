import { NextResponse, type NextRequest } from "next/server";
import { routeFor } from "@/lib/hosts";

/** Serves every school, the platform site and the admin area from one app (amendment §2.4). */
export function proxy(request: NextRequest) {
  const target = routeFor(
    request.headers.get("host") ?? "",
    request.nextUrl.pathname,
    process.env.PLATFORM_DOMAIN ?? "localhost",
  );
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except the API and media (forwarded to Django) and Next.js internals.
  matcher: ["/((?!api/|media/|_next/).*)"],
};
