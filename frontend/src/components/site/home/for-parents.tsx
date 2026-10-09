import { HeartHandshake, MessageSquareText, ShieldCheck, Smartphone, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf } from "@/lib/api";
import type { FeatureIcon, SiteData } from "@/lib/types";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  message: MessageSquareText,
  phone: Smartphone,
  care: HeartHandshake,
  shield: ShieldCheck,
};

/** Only features the admin has switched on (i.e. live) are shown (spec §6.2). */
export function ForParents({ site }: { site: SiteData }) {
  if (site.features.length === 0) return null;
  return (
    <section aria-labelledby="parents-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="parents-title"
          eyebrow="For parents"
          title="Close to your child's school day"
          intro={contentOf(site, "for_parents_intro")}
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {site.features.map((feature) => {
            const Icon = ICONS[feature.icon];
            return (
              <li key={feature.key} className="surface rounded-card p-6">
                <span className="inline-flex size-12 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                  <Icon aria-hidden className="size-6" />
                </span>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-ink-muted">{feature.text}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
