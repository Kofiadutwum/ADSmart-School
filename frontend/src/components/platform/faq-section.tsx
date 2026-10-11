import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { SectionHeading } from "@/components/ui/section-heading";
import { plainText } from "@/lib/rich-text";
import type { PlatformFaq } from "@/lib/types";

/** Questions and answers, opening in place, and marked up for search engines (§5.5). */
export function FaqSection({ faqs }: { faqs: PlatformFaq[] }) {
  if (faqs.length === 0) return null;
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: plainText(item.answer) },
    })),
  };
  // "<" is escaped so written text can never close the script element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 pb-20 sm:pb-28">
      <Container>
        <SectionHeading id="faq-title" eyebrow="Questions" title="Questions schools ask" />
        <div className="mt-10 max-w-3xl divide-y divide-line rounded-card border border-line bg-card">
          {faqs.map((item) => (
            <details key={item.id} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold">
                {item.question}
                <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <RichText text={item.answer} headingLevel={3} className="pb-5 text-ink-muted" />
            </details>
          ))}
        </div>
      </Container>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    </section>
  );
}
