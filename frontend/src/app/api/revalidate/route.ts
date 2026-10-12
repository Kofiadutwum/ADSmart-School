import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

const TAGS = new Set(["platform", "sites"]);

function sameSecret(given: string | null, secret: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Django calls this after the owner's website content or a school's profile changes, so the
 * change shows at once (business tools spec §5.7; Stage 7). Without the shared secret nothing
 * happens. */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  if (!secret || !sameSecret(request.headers.get("x-revalidate-secret"), secret)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tag?: unknown } | null;
  const tag = typeof body?.tag === "string" ? body.tag : "";
  if (!TAGS.has(tag)) return Response.json({ revalidated: false }, { status: 400 });
  revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true });
}
