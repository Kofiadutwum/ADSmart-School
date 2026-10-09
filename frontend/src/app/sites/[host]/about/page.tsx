import type { Metadata } from "next";
import { Quote } from "lucide-react";
import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { ProofStrip } from "@/components/site/home/proof-strip";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { contentOf, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "About us", description: `The story of ${school.name} in ${school.town}.` };
}

export default async function AboutPage({ params }: Props) {
  const site = await getSite((await params).host);
  const photo = site.photos.about;
  return (
    <>
      <PageHero eyebrow={contentOf(site, "hero_subline")} title={`About ${site.school.name}`} intro={site.school.motto || undefined} />
      <section aria-labelledby="story-title" className="py-16 sm:py-24">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 id="story-title" className="text-3xl font-bold">Our story</h2>
            <RichText text={contentOf(site, "about_history")} headingLevel={3} className="mt-6 text-lg" />
          </div>
          {photo && (
            <ResponsiveImage
              image={photo}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-card object-cover shadow-elev-2"
            />
          )}
        </Container>
      </section>
      <ProofStrip facts={site.facts} overlap={false} />
      <section aria-labelledby="welcome-title" className="py-16 sm:py-24">
        <Container>
          <figure className="surface mx-auto max-w-3xl rounded-card p-8 sm:p-12">
            <h2 id="welcome-title" className="sr-only">A welcome from the head teacher</h2>
            <Quote aria-hidden className="size-10 text-indigo" />
            <blockquote className="mt-4 text-xl leading-relaxed">
              <RichText text={contentOf(site, "head_teacher_welcome")} />
            </blockquote>
            <figcaption className="mt-6 font-semibold">{contentOf(site, "head_teacher_name")}</figcaption>
          </figure>
        </Container>
      </section>
      <AdmissionsCta site={site} />
    </>
  );
}
