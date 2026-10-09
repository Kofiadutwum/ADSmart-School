"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

/** A failed submit's message, focused so keyboard and screen-reader users hear it (spec §8.7). */
export function FormAlert({ message, focusKey = 0 }: { message: string | null; focusKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message, focusKey]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-2 rounded-control border border-danger bg-danger/10 p-4 outline-none"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <p>{message}</p>
    </div>
  );
}
