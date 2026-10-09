import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";

export function Hero({ site }: { site: SiteData }) {
  const photo = site.photos.hero;
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[88svh] items-end overflow-hidden pt-28 pb-20 sm:min-h-[680px] sm:items-center"
    >
      {photo ? (
        <ResponsiveImage
          image={photo}
          // Under the scrim and glass the photo is a backdrop, so phones take the 480w rendition.
          sizes="(max-width: 640px) 60vw, 100vw"
          priority
          className="absolute inset-0 -z-20 size-full object-cover"
        />
      ) : (
        <div data-testid="hero-fallback" className="bg-brand-mesh absolute inset-0 -z-20" />
      )}
      <div aria-hidden className="scrim absolute inset-0 -z-10" />
      <Container>
        <div className="glass-clear on-dark animate-rise max-w-2xl rounded-card p-6 text-white sm:p-10">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <span aria-hidden className="h-1 w-6 rounded-full bg-amber" />
            {contentOf(site, "hero_subline")}
          </p>
          <h1 id="hero-title" className="mt-3 text-4xl font-bold sm:text-5xl">
            {contentOf(site, "hero_headline", site.school.name)}
          </h1>
          <p className="mt-4 text-lg text-white/90">{contentOf(site, "hero_intro")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/admissions#enquiry" variant="amber" size="lg">
              Apply for admission
            </ButtonLink>
            <ButtonLink href="/admissions#enquiry" variant="glass" size="lg">
              Book a school visit
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
