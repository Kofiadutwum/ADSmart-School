import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { RichText } from "@/components/ui/rich-text";
import { contentOf, getSite } from "@/lib/api";
import { LEVELS } from "@/lib/levels";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Admissions",
  description: "How to join AD Smart School in Kronom, Kumasi: steps, documents, ages and an online enquiry form.",
};

export default async function AdmissionsPage() {
  const site = await getSite();
  const { school } = site;
  return (
    <>
      <PageHero eyebrow="Admissions" title={`Join ${school.name}`} intro={contentOf(site, "admissions_intro")} />
      <section className="py-16 sm:py-24">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div className="surface rounded-card p-6 sm:p-8">
            <h2 className="text-2xl font-bold">How admission works</h2>
            <RichText text={contentOf(site, "admissions_steps")} className="mt-4" />
          </div>
          <div className="surface rounded-card p-6 sm:p-8">
            <h2 className="text-2xl font-bold">What to bring</h2>
            <RichText text={contentOf(site, "admissions_requirements")} className="mt-4" />
          </div>
        </Container>
      </section>
      <section aria-labelledby="ages-title" className="pb-16 sm:pb-24">
        <Container>
          <h2 id="ages-title" className="text-2xl font-bold">Age guide</h2>
          <div className="surface mt-6 overflow-x-auto rounded-card">
            <table className="w-full text-left">
              <caption className="sr-only">Typical ages for each level</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-4">Level</th>
                  <th scope="col" className="p-4">Typical age</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((level) => (
                  <tr key={level.code} className="border-b border-line last:border-0">
                    <th scope="row" className="p-4 font-medium">{level.name}</th>
                    <td className="p-4 text-ink-muted">{contentOf(site, `level_${level.code}_ages`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>
      <section id="enquiry" aria-labelledby="enquiry-title" className="scroll-mt-24 pb-20 sm:pb-28">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="enquiry-title" className="text-3xl font-bold">Send an enquiry</h2>
            <p className="mt-4 text-lg text-ink-muted">
              Tell us about your child and we&apos;ll call you to arrange a visit. Prefer to talk? Call{" "}
              <a className="link" href={`tel:${school.phone}`}>
                {school.phone_display}
              </a>
              .
            </p>
          </div>
          <EnquiryForm schoolPhone={school.phone_display} />
        </Container>
      </section>
    </>
  );
}
