import { cn } from "@/lib/cn";

const SIZES = { sm: "size-10 text-sm", md: "size-14 text-lg", lg: "size-24 text-2xl" } as const;

type Props = { src: string | null; initials: string; name: string; size?: keyof typeof SIZES };

/** A pupil's or pick-up person's photo, or their initials when there is none or no photo
 * consent (Phase 1 spec §3.5). The photo comes through a permission-checked API route. */
export function PersonPhoto({ src, initials, name, size = "md" }: Props) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- served privately by the API, not optimisable
    return <img src={src} alt={`Photo of ${name}`} className={cn(SIZES[size], "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        SIZES[size],
        "inline-flex shrink-0 items-center justify-center rounded-full bg-indigo/15 font-semibold text-indigo",
      )}
    >
      {initials}
    </span>
  );
}
