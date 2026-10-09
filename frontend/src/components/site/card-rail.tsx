"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion";

type Props = { label: string; children: ReactNode; className?: string };

const ARROW =
  "press surface inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink";

/** Swipeable row on phones (with buttons as the alternative), grid on large screens. */
export function CardRail({ label, children, className }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  function scrollByPage(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * list.clientWidth * 0.85,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <div className={className}>
      <ul
        ref={listRef}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
      >
        {Children.map(children, (child) => (
          <li className="w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-auto">{child}</li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2 lg:hidden">
        <button type="button" className={ARROW} aria-label={`Scroll ${label} back`} onClick={() => scrollByPage(-1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button type="button" className={ARROW} aria-label={`Scroll ${label} forward`} onClick={() => scrollByPage(1)}>
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
