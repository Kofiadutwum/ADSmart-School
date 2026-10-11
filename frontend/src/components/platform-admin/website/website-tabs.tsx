"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { publicPath } from "@/lib/hosts";

const TABS = [
  ["/website/articles", "Articles and tips"],
  ["/website/gallery", "Gallery"],
  ["/website/comments", "Comments from schools"],
  ["/website/questions", "Questions"],
  ["/website/tips", "Tips and WhatsApp"],
] as const;

/** The parts of your own website you can edit (business tools spec §5). */
export function WebsiteTabs() {
  const path = publicPath(usePathname());
  return (
    <nav aria-label="Website" className="mb-8 flex gap-1 overflow-x-auto border-b border-line pb-2">
      {TABS.map(([href, label]) => {
        const current = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold",
              current ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
