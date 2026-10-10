import { cn } from "@/lib/cn";
import type { SchoolStatus } from "@/lib/types";

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
};

const STYLES: Record<SchoolStatus, string> = {
  trial: "bg-amber/25",
  active: "bg-success/15",
  suspended: "bg-danger/15",
};

/** The word carries the meaning; the colour only helps (WCAG 1.4.1). */
export function StatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink", STYLES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
