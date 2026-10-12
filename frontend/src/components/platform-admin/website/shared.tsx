"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export {
  CHECK_FORM,
  ConfirmDelete,
  firstProblem,
  LoadState,
  textareaClasses,
  Tick,
  useLoad,
} from "@/components/portal/kit";

export const WEBSITE_API = "/api/platform/website";

export function moved<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

type OrderProps = {
  label: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (delta: -1 | 1) => void;
};

/** Up and down buttons: the keyboard-friendly way to reorder (business tools spec §5.2). */
export function OrderButtons({
  label,
  index,
  count,
  disabled = false,
  onMove,
}: OrderProps) {
  return (
    <span className="inline-flex gap-2">
      <Button
        variant="outline"
        className="px-3"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden className="size-4" />
      </Button>
      <Button
        variant="outline"
        className="px-3"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden className="size-4" />
      </Button>
    </span>
  );
}
