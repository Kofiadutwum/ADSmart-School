"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { publicPath } from "@/lib/hosts";

/** The pages of one portal section as a row of tabs; the current one is marked. */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly (readonly [string, string])[] }) {
  const path = publicPath(usePathname());
  return (
    <nav aria-label={label} className="mb-8 flex gap-1 overflow-x-auto border-b border-line pb-2">
      {tabs.map(([href, text]) => {
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
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
