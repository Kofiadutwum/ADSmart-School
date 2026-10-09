"use client";

import { useAnimate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { springs } from "@/lib/motion";

type Props = { children: ReactNode; index?: number; className?: string };

/**
 * Swings content into place from its top edge the first time it scrolls into view
 * (spec §8.6). Content already on screen at load is never hidden, so a slow phone
 * never shows empty space while JavaScript loads.
 */
export function SwingIn({ children, index = 0, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [, animate] = useAnimate();
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const reduceMotion = useReducedMotion();
  const armed = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduceMotion) return;
    if (element.getBoundingClientRect().top > window.innerHeight) {
      armed.current = true;
      element.style.opacity = "0";
      element.style.transformOrigin = "50% 0%";
      element.style.transform = "rotate(-6deg)";
    }
  }, [reduceMotion]);

  useEffect(() => {
    const element = ref.current;
    if (!inView || !armed.current || !element) return;
    armed.current = false;
    animate(
      element,
      { opacity: [0, 1], rotate: [-6, 0] },
      { ...springs.swing, delay: Math.min(index, 10) * 0.03 },
    );
  }, [inView, animate, index]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
