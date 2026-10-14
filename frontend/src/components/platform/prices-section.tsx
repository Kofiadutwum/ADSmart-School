import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import type { PlatformPrices } from "@/lib/types";

/** Whole cedis for prices: 120000 pesewas → "GH₵1,200". */
export function cedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
}

/** The plans on the owner's website (business tools spec §3.1, §5.1). Hidden when there are none. */
export function PricesSection({ prices }: { prices: PlatformPrices | null }) {
  if (!prices || prices.plans.length === 0) return null;
  return (
    <section id="prices" aria-labelledby="prices-title" className="scroll-mt-24 pb-20 sm:pb-28">
      <Container>
        <SectionHeading id="prices-title" eyebrow="Prices" title="One yearly price, everything included" />
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {prices.plans.map((plan) => (
            <li key={plan.name}>
              <article aria-labelledby={`plan-${plan.name}`} className="surface flex h-full flex-col rounded-card p-6 shadow-elev-1">
                <h3 id={`plan-${plan.name}`} className="text-xl font-semibold">
                  {plan.name}
                </h3>
                {plan.audience && <p className="mt-2 text-ink-muted">{plan.audience}</p>}
                <p className="mt-5">
                  {plan.from_price && <span className="block text-sm font-semibold text-ink-muted">From</span>}
                  <span className="text-3xl font-bold tabular-nums">{cedis(plan.yearly_price)}</span>
                  <span className="text-ink-muted"> a year</span>
                </p>
                {plan.includes.length > 0 && (
                  <ul className="mt-5 space-y-2 text-sm">
                    {plan.includes.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-6">
                  <ButtonLink href="#get-online" variant={plan.from_price ? "outline" : "primary"} className="w-full">
                    {plan.from_price ? "Talk to us" : "Get started"}
                  </ButtonLink>
                </div>
              </article>
            </li>
          ))}
        </ul>
        {prices.setup_fee > 0 && (
          <p className="mt-8 text-center text-ink-muted">
            Plus a one-time setup fee of <strong className="text-ink">{cedis(prices.setup_fee)}</strong>, paid with
            your first bill.
          </p>
        )}
      </Container>
    </section>
  );
}
