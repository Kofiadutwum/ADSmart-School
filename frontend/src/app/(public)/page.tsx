import { AdmissionsCta } from "@/components/site/home/admissions-cta";
import { ForParents } from "@/components/site/home/for-parents";
import { Gallery } from "@/components/site/home/gallery";
import { Hero } from "@/components/site/home/hero";
import { LevelsSection } from "@/components/site/home/levels-section";
import { ProofStrip } from "@/components/site/home/proof-strip";
import { NewsSection } from "@/components/site/news-cards";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { contentOf, getNewsList, getSite } from "@/lib/api";

export const revalidate = 300;

export default async function HomePage() {
  const [site, news] = await Promise.all([getSite(), getNewsList(3)]);
  return (
    <>
      <Hero site={site} />
      <ProofStrip facts={site.facts} />
      <LevelsSection site={site} />
      <ForParents site={site} />
      {site.gallery.length > 0 && (
        <section aria-labelledby="gallery-title" className="py-20 sm:py-28">
          <Container>
            <SectionHeading
              id="gallery-title"
              eyebrow="Around the school"
              title="A look inside"
              intro={contentOf(site, "gallery_intro")}
            />
            <Gallery photos={site.gallery} className="mt-10" />
          </Container>
        </section>
      )}
      <NewsSection posts={news} />
      <AdmissionsCta site={site} />
    </>
  );
}
