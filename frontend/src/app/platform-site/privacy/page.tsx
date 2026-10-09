import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { PrivacyNoticeContent } from "@/components/site/privacy-notice-content";
import { Container } from "@/components/ui/container";
import { getPlatformPrivacyNotice } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "Privacy notice", description: "How we use and protect personal information (Data Protection Act, 2012)." };

export default async function PlatformPrivacyPage() {
  const notice = await getPlatformPrivacyNotice();
  return (
    <>
      <PageHero eyebrow="Your data" title={notice?.title ?? "Privacy notice"} />
      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl">
            <PrivacyNoticeContent notice={notice} />
          </div>
        </Container>
      </section>
    </>
  );
}
