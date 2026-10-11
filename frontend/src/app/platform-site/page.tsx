import { Globe, Inbox, ShieldCheck, Smartphone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { SwingIn } from "@/components/motion/swing-in";
import { ArticlesSection } from "@/components/platform/articles-section";
import { FaqSection } from "@/components/platform/faq-section";
import { LeadForm } from "@/components/platform/lead-form";
import { PhotoGrid } from "@/components/platform/photo-grid";
import { TestimonialsSection } from "@/components/platform/testimonials-section";
import { TipsSignup } from "@/components/platform/tips-signup";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { getPlatform } from "@/lib/api";

export const revalidate = 300;
const GALLERY_ON_HOME = 12;

// Only what a school gets today; new features join this list as they ship (amendment §6).
const FEATURES: { title: string; text: string; Icon: LucideIcon }[] = [
  {
    title: "Your own website",
    text: "A fast, accessible school website at your own address, or on your school's own domain.",
    Icon: Globe,
  },
  {
    title: "Admissions enquiries",
    text: "Parents enquire online and the school is emailed straight away, with spam kept out.",
    Icon: Inbox,
  },
  {
    title: "Made for phones",
    text: "Quick on mobile data, with light and dark modes and a lighter mode for older phones.",
    Icon: Smartphone,
  },
  {
    title: "Your information stays yours",
    text: "Each school's records are kept apart from every other school's, and nothing goes public until you say so.",
    Icon: ShieldCheck,
  },
];

export default async function PlatformHomePage() {
  const platform = await getPlatform();
  return (
    <>
      <section className="bg-brand-mesh on-dark relative isolate overflow-hidden pt-32 pb-20 text-white sm:pt-40 sm:pb-28">
        <Container>
          <div className="glass-clear animate-rise max-w-2xl rounded-card p-6 sm:p-10">
            <p className="text-sm font-semibold tracking-wider uppercase">{platform.name}</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Your school, online</h1>
            <p className="mt-5 text-lg text-white/90">
              A website and school system made for schools in Ghana: quick on any phone, simple for staff and clear
              for parents.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="#get-online" variant="amber" size="lg">
                Get your school online
              </ButtonLink>
              {platform.schools.length > 0 && (
                <ButtonLink href="#schools" variant="glass" size="lg">
                  See our schools
                </ButtonLink>
              )}
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="features-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading id="features-title" eyebrow="What your school gets" title="Everything in one place" />
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ title, text, Icon }, index) => (
              <li key={title}>
                <SwingIn index={index} className="h-full">
                  <article className="surface h-full rounded-card p-6 shadow-elev-1">
                    <span className="inline-flex size-12 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                      <Icon aria-hidden className="size-6" />
                    </span>
                    <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                    <p className="mt-2 text-ink-muted">{text}</p>
                  </article>
                </SwingIn>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {platform.schools.length > 0 && (
        <section id="schools" aria-labelledby="schools-title" className="scroll-mt-24 pb-20 sm:pb-28">
          <Container>
            <SectionHeading id="schools-title" eyebrow="Already online" title={`Schools on ${platform.name}`} />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platform.schools.map((school) => (
                <li key={school.url}>
                  <a href={school.url} className="surface press block rounded-card p-6 hover:shadow-elev-2">
                    <span className="text-lg font-semibold">{school.name}</span>
                    <span className="mt-1 block text-ink-muted">
                      {school.town}, {school.region}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {platform.gallery.length > 0 && (
        <section id="gallery" aria-labelledby="gallery-title" className="scroll-mt-24 pb-20 sm:pb-28">
          <Container>
            <SectionHeading id="gallery-title" eyebrow="Gallery" title="A closer look" />
            <PhotoGrid photos={platform.gallery.slice(0, GALLERY_ON_HOME)} />
            {platform.gallery.length > GALLERY_ON_HOME && (
              <p className="mt-6">
                <Link href="/gallery" className="link inline-flex min-h-11 items-center font-semibold">
                  See all photos
                </Link>
              </p>
            )}
          </Container>
        </section>
      )}

      <TestimonialsSection testimonials={platform.testimonials} />
      <ArticlesSection articles={platform.latest_articles} />
      <FaqSection faqs={platform.faqs} />

      <section id="get-online" aria-labelledby="get-online-title" className="scroll-mt-24 bg-card py-20 sm:py-28">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="get-online-title" className="text-3xl font-bold">Get your school online</h2>
            <p className="mt-4 text-lg text-ink-muted">
              Tell us about your school and we&apos;ll call you to talk it through.
            </p>
            {platform.email && (
              <p className="mt-4">
                Or email{" "}
                <a className="link" href={`mailto:${platform.email}`}>
                  {platform.email}
                </a>
                .
              </p>
            )}
            <div className="mt-8">
              <TipsSignup platformName={platform.name} />
            </div>
          </div>
          <LeadForm platformName={platform.name} />
        </Container>
      </section>
    </>
  );
}
