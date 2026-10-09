import { cn } from "@/lib/cn";
import type { ImageData } from "@/lib/types";

const SKIP = /^(the|of|and|school|schools|academy|complex)$/i;

/** Up to two initials for a school without a logo: "Bright Future Academy" gives "BF". */
export function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const kept = words.filter((word) => !SKIP.test(word));
  return (kept.length ? kept : words)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

type Props = { name: string; logo: ImageData | null; className?: string };

/** The school's logo, or a monogram in its brand colour (amendment §7.2). Decorative: the
 * school's name is always written next to it. */
export function SchoolMark({ name, logo, className }: Props) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP renditions from Django
      <img
        src={logo.src}
        srcSet={logo.srcset}
        sizes="72px"
        alt=""
        width={logo.width}
        height={logo.height}
        fetchPriority="low"
        decoding="async"
        className={cn("h-8 w-auto sm:h-9", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("flex size-8 items-center justify-center rounded-[8px] bg-primary text-sm font-bold text-white sm:size-9", className)}
    >
      {initials(name)}
    </span>
  );
}
