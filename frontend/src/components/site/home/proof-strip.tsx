import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { Fact } from "@/lib/types";

export function ProofStrip({ facts, overlap = true }: { facts: Fact[]; overlap?: boolean }) {
  if (facts.length === 0) return null;
  return (
    <section aria-label="At a glance" className={cn("relative z-10", overlap ? "-mt-12" : "py-8")}>
      <Container>
        <dl className="grid gap-4 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="glass-frosted flex flex-col-reverse rounded-card p-6 shadow-elev-2">
              <dt className="text-ink-muted">{fact.label}</dt>
              <dd className="text-3xl font-bold text-indigo tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
