import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { PrivacyNoticeContent } from "@/components/site/privacy-notice-content";
import { Container } from "@/components/ui/container";
import { getPrivacyNotice, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return {
    title: "Privacy notice",
    description: `How ${school.name} uses and protects personal information (Data Protection Act, 2012).`,
  };
}

export default async function PrivacyPage({ params }: Props) {
  const notice = await getPrivacyNotice((await params).host);
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
