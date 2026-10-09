import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandStyle } from "@/components/site/brand-style";
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

/** Every page at a school's address wears that school's colours. */
export default async function SiteLayout({ children, params }: Params & { children: ReactNode }) {
  const site = await getSite((await params).host);
  return (
    <>
      <BrandStyle brand={site.brand} />
      {children}
    </>
  );
}
