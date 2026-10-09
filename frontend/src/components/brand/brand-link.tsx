"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";
import { LogoMark } from "./logo-mark";

export function BrandLink({ name, className }: { name: string; className?: string }) {
  const [gemRef, animate] = useAnimate<SVGGElement>();
  const reduceMotion = useReducedMotion();

  const swing = useCallback(() => {
    if (reduceMotion || !gemRef.current) return;
    animate(gemRef.current, { rotate: [9, 0] }, springs.swing);
  }, [animate, gemRef, reduceMotion]);

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
      <span className="logo-tile">
        <LogoMark gemRef={gemRef} className="h-8 w-auto sm:h-9" />
      </span>
      <span className="text-base leading-tight font-semibold sm:text-lg">{name}</span>
    </Link>
  );
}
