import { Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";

export function AdmissionsCta({ site }: { site: SiteData }) {
  return (
    <section aria-labelledby="visit-title" className="bg-brand-mesh on-dark relative overflow-hidden py-20 text-white sm:py-28">
      <Container>
        <div className="glass-clear mx-auto max-w-3xl rounded-card p-8 text-center sm:p-12">
          <h2 id="visit-title" className="text-3xl font-bold sm:text-4xl">
            {contentOf(site, "admissions_cta_heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">{contentOf(site, "admissions_cta_text")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/admissions#enquiry" variant="amber" size="lg">
              Apply for admission
            </ButtonLink>
            <ButtonLink href={`tel:${site.school.phone}`} variant="glass" size="lg">
              <Phone aria-hidden className="size-5" />
              Call {site.school.phone_display}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
