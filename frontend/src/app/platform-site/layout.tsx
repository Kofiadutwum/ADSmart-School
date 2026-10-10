import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PlatformFooter } from "@/components/platform/platform-footer";
import { PlatformHeader } from "@/components/platform/platform-header";
import { OfflineBar } from "@/components/site/offline-bar";
import { PreviewRibbon } from "@/components/site/preview-ribbon";
import { SkipLink } from "@/components/site/skip-link";
import { getPlatform } from "@/lib/api";
import { PLATFORM_ICON } from "@/lib/platform-brand";

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatform();
  return {
    metadataBase: new URL(platform.url),
    title: { default: `${platform.name} · School websites for Ghana`, template: `%s · ${platform.name}` },
    description: "A website and school system made for schools in Ghana: quick on any phone, simple for staff and clear for parents.",
    applicationName: platform.name,
    icons: { icon: PLATFORM_ICON, apple: PLATFORM_ICON },
    robots: platform.is_public ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const platform = await getPlatform();
  return (
    <>
      <SkipLink />
      <PlatformHeader name={platform.name} />
      <OfflineBar />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <PlatformFooter name={platform.name} email={platform.email} phone={platform.phone} phoneDisplay={platform.phone_display} />
      {!platform.is_public && <PreviewRibbon />}
    </>
  );
}
