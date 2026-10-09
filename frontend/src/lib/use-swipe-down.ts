"use client";

import { useRef, useState, type PointerEvent } from "react";

const START_THRESHOLD = 12;
const CLOSE_DISTANCE = 110;

/** Swipe down to dismiss (spec §8.5). Always pair with a visible close button. */
export function useSwipeDown(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const tracking = useRef(false);
  const [offset, setOffset] = useState(0);

  function reset() {
    start.current = null;
    tracking.current = false;
    setOffset(0);
  }

  return {
    offset,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        start.current = { x: event.clientX, y: event.clientY };
        tracking.current = false;
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (!tracking.current) {
          if (dy > START_THRESHOLD && dy > Math.abs(dx)) tracking.current = true;
          else return;
        }
        setOffset(Math.max(0, dy));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const shouldClose =
          tracking.current && start.current !== null && event.clientY - start.current.y > CLOSE_DISTANCE;
        reset();
        if (shouldClose) onClose();
      },
      onPointerCancel() {
        reset();
      },
    },
  };
}
