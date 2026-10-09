import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandStyle } from "@/components/site/brand-style";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SchoolJsonLd } from "@/components/site/school-json-ld";
import { SkipLink } from "@/components/site/skip-link";
import { contentOf, getSite } from "@/lib/api";

type Params = { params: Promise<{ host: string }> };

// Each school's pages are built on its first visit, then cached per host (ISR).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const site = await getSite((await params).host);
  const { school } = site;
  return {
    metadataBase: new URL(school.base_url),
    title: { default: `${school.name} · ${school.town}`, template: `%s · ${school.name}` },
    description: contentOf(site, "hero_intro", `${school.name} in ${school.town}.`),
    applicationName: school.name,
    // Preview pages must never be indexed (Phase 1 spec §6.5).
    robots: site.is_public ? { index: true, follow: true } : { index: false, follow: false },
    icons: school.logo ? { icon: school.logo.src } : undefined,
  };
}

export default async function SiteLayout({ children, params }: Params & { children: ReactNode }) {
  const site = await getSite((await params).host);
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || undefined;
  return (
    <>
      <BrandStyle brand={site.brand} />
      <SkipLink />
      <Header schoolName={site.school.name} logo={site.school.logo} portalUrl={portalUrl} />
      <OfflineBar />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer site={site} />
      {!site.is_public && <PreviewRibbon />}
      <SchoolJsonLd school={site.school} />
    </>
  );
}
