import type { ReactNode } from "react";

/** A sticky glass bar holding a long form's Save button, always in reach (Phase 1 spec §7.5). */
export function SaveBar({ children }: { children: ReactNode }) {
  return (
    <div className="glass-frosted sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:mx-0 sm:rounded-card sm:border">
      {children}
    </div>
  );
}
