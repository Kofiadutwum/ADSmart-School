"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";
import type { ImageData } from "@/lib/types";
import { SchoolMark } from "./school-mark";

type Props = { name: string; logo?: ImageData | null; className?: string };

export function BrandLink({ name, logo = null, className }: Props) {
  const [tileRef, animate] = useAnimate<HTMLSpanElement>();
  const reduceMotion = useReducedMotion();

  // The logo tile swings from its top edge (spec §8.6), whatever the school's logo is.
  const swing = useCallback(() => {
    if (reduceMotion || !tileRef.current) return;
    animate(tileRef.current, { rotate: [-7, 0] }, springs.swing);
  }, [animate, tileRef, reduceMotion]);

  useEffect(() => {
    swing();
  }, [swing]);

  return (
    <Link
      href="/"
      className={cn("inline-flex min-h-11 items-center gap-3 rounded-control", className)}
      onMouseEnter={swing}
      onFocus={swing}
    >
      <span ref={tileRef} className="logo-tile shrink-0 origin-top">
        <SchoolMark name={name} logo={logo} />
      </span>
      <span className="text-base leading-tight font-semibold sm:text-lg">{name}</span>
    </Link>
  );
}
