import type { Metadata } from "next";
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";
import { LEVELS } from "@/lib/levels";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Levels",
  description: "Crèche, Nursery, Kindergarten, Primary and Junior High School at AD Smart School, Kronom, Kumasi.",
};

export default async function LevelsPage() {
  const site = await getSite();
  return (
    <>
      <PageHero eyebrow="Our levels" title="From Crèche to JHS" intro={contentOf(site, "levels_intro")} />
      <section className="py-16 sm:py-24">
        <Container className="space-y-6">
          {LEVELS.map((level) => (
            <article
              key={level.code}
              id={level.code}
              aria-labelledby={`${level.code}-title`}
              className="surface grid scroll-mt-28 gap-4 rounded-card p-6 sm:p-8 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <CategoryBadge category={level.category} />
                <h2 id={`${level.code}-title`} className="mt-3 text-2xl font-bold">
                  {level.name}
                </h2>
                <p className="mt-1 font-medium text-ink-muted">{contentOf(site, `level_${level.code}_ages`)}</p>
              </div>
              <div className="space-y-3 text-lg">
                <p className="font-medium">{contentOf(site, `level_${level.code}_summary`)}</p>
                <p className="text-ink-muted">{contentOf(site, `level_${level.code}_detail`)}</p>
                <ButtonLink href="/admissions#enquiry" variant="outline">
                  Enquire about {level.shortName}
                </ButtonLink>
              </div>
            </article>
          ))}
        </Container>
      </section>
      <AdmissionsCta site={site} />
    </>
  );
}
