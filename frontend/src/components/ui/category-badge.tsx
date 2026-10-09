import { cn } from "@/lib/cn";
import { CATEGORY_LABEL, type Category } from "@/lib/levels";

const DOT: Record<Category, string> = {
  early_years: "bg-amber",
  primary: "bg-cerulean",
  jhs: "bg-violet",
};

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-ink",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2.5 rounded-full", DOT[category])} />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
