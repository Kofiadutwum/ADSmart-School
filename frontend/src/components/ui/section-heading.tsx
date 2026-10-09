import { cn } from "@/lib/cn";

type Props = {
  title: string;
  eyebrow?: string;
  intro?: string;
  id?: string;
  align?: "start" | "center";
  className?: string;
};

export function SectionHeading({ title, eyebrow, intro, id, align = "start", className }: Props) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p className="text-sm font-semibold tracking-wider text-indigo uppercase">{eyebrow}</p>
      )}
      <h2 id={id} className="mt-2 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-lg text-ink-muted">{intro}</p>}
    </div>
  );
}
