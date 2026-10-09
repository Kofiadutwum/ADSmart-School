import type { SchoolInfo } from "@/lib/types";

export function schoolJsonLd(school: SchoolInfo) {
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    url: school.base_url,
    ...(school.founded_year ? { foundingDate: String(school.founded_year) } : {}),
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
  // "<" is escaped so a school's own text can never close the script element.
  const json = JSON.stringify(schoolJsonLd(school)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
