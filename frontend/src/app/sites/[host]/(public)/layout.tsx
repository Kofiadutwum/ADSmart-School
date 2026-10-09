import type { ReactNode } from "react";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SchoolJsonLd } from "@/components/site/school-json-ld";
import { SkipLink } from "@/components/site/skip-link";
import { getSite } from "@/lib/api";

type Props = { children: ReactNode; params: Promise<{ host: string }> };

/** The public website's frame: header, footer and, before launch, the preview ribbon. */
export default async function PublicLayout({ children, params }: Props) {
  const site = await getSite((await params).host);
  return (
    <>
      <SkipLink />
      <Header schoolName={site.school.name} logo={site.school.logo} portalUrl="/sign-in" />
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
