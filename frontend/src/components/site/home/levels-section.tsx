import Link from "next/link";
import { SwingIn } from "@/components/motion/swing-in";
import { CardRail } from "@/components/site/card-rail";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf } from "@/lib/api";
import { LEVELS, offeredLevels } from "@/lib/levels";
import type { SiteData } from "@/lib/types";

export function LevelsSection({ site }: { site: SiteData }) {
  const levels = offeredLevels(site.school.levels_offered);
  return (
    <section aria-labelledby="levels-title" className="relative isolate overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="bg-brand-mesh pointer-events-none absolute -top-24 right-[-10%] -z-10 size-[28rem] rounded-full opacity-15 blur-3xl lite:hidden"
      />
      <Container>
        <SectionHeading
          id="levels-title"
          eyebrow="Our levels"
          title={levels.length === LEVELS.length ? "From first steps to the BECE" : "The levels we teach"}
          intro={contentOf(site, "levels_intro")}
        />
        <CardRail label="School levels" className="mt-10">
          {levels.map((level, index) => (
            <SwingIn key={level.code} index={index} className="h-full">
              <article className="surface flex h-full flex-col rounded-card p-6 shadow-elev-1">
                <CategoryBadge category={level.category} className="self-start" />
                <h3 className="mt-4 text-xl font-semibold">{level.name}</h3>
                <p className="mt-1 text-sm font-medium text-ink-muted">
                  {contentOf(site, `level_${level.code}_ages`)}
                </p>
                <p className="mt-3 flex-1">{contentOf(site, `level_${level.code}_summary`)}</p>
                <Link href={`/levels#${level.code}`} className="link mt-4 inline-flex min-h-11 items-center font-medium">
                  More about {level.shortName}
                  <span aria-hidden>&nbsp;→</span>
                </Link>
              </article>
            </SwingIn>
          ))}
        </CardRail>
      </Container>
    </section>
  );
}
