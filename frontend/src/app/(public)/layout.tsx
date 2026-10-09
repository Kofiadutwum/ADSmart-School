import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SchoolJsonLd } from "@/components/site/school-json-ld";
import { SkipLink } from "@/components/site/skip-link";
import { getSite } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  // Preview pages must never be indexed (spec §6.5).
  return { robots: site.is_public ? { index: true, follow: true } : { index: false, follow: false } };
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || undefined;
  return (
    <>
      <SkipLink />
      <Header schoolName={site.school.name} portalUrl={portalUrl} />
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
