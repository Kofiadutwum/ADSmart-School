import { siteUrl } from "@/lib/site-url";
import type { SchoolInfo } from "@/lib/types";

export function schoolJsonLd(school: SchoolInfo, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    url,
    foundingDate: String(school.founded_year),
    telephone: school.phone,
    email: school.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: school.town,
      addressRegion: school.region,
      addressCountry: "GH",
    },
  };
}

export function SchoolJsonLd({ school }: { school: SchoolInfo }) {
  const json = JSON.stringify(schoolJsonLd(school, siteUrl())).replace(/</g, "\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
