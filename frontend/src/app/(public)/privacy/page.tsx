import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { getPrivacyNotice } from "@/lib/api";
import { formatDate } from "@/lib/dates";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How AD Smart School uses and protects personal information (Data Protection Act, 2012).",
};

export default async function PrivacyPage() {
  const notice = await getPrivacyNotice();
  return (
    <>
      <PageHero eyebrow="Your data" title={notice?.title ?? "Privacy notice"} />
      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl">
            {notice ? (
              <>
                {notice.is_draft && (
                  <p role="note" className="surface mb-8 rounded-card p-4 font-medium">
                    This notice is a draft and is still being reviewed.
                  </p>
                )}
                <RichText text={notice.body} className="text-lg" />
                <p className="mt-10 text-sm text-ink-muted">
                  Version {notice.version}, effective {formatDate(notice.effective_from)}.
                </p>
              </>
            ) : (
              <p className="text-lg">Our privacy notice will be published here soon.</p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
