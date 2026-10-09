import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MapEmbed } from "@/components/site/map-embed";
import { PageHero } from "@/components/site/page-hero";
import { Container } from "@/components/ui/container";
import { contentOf, getSite } from "@/lib/api";

type Props = { params: Promise<{ host: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await getSite((await params).host);
  return { title: "Contact", description: `Call, message, email or visit ${school.name} in ${school.town}.` };
}

export default async function ContactPage({ params }: Props) {
  const site = await getSite((await params).host);
  const { school } = site;
  const place = [school.address, school.town, school.region].filter(Boolean).join(", ");
  const cards: { title: string; Icon: LucideIcon; body: ReactNode }[] = [
    {
      title: "Call us",
      Icon: Phone,
      body: <a className="link inline-flex min-h-11 items-center" href={`tel:${school.phone}`}>{school.phone_display}</a>,
    },
    ...(school.whatsapp_link
      ? [{
          title: "WhatsApp",
          Icon: MessageCircle,
          body: <a className="link inline-flex min-h-11 items-center" href={school.whatsapp_link} rel="noopener">Chat with us on WhatsApp</a>,
        }]
      : []),
    {
      title: "Email",
      Icon: Mail,
      body: <a className="link inline-flex min-h-11 items-center break-all" href={`mailto:${school.email}`}>{school.email}</a>,
    },
    {
      title: "Visit us",
      Icon: MapPin,
      body: (
        <p>
          {place}
          {school.ghana_post_gps && <><br />GhanaPost GPS: {school.ghana_post_gps}</>}
        </p>
      ),
    },
    { title: "Office hours", Icon: Clock, body: <p>{contentOf(site, "contact_hours")}</p> },
  ];
  return (
    <>
      <PageHero eyebrow="Contact" title="Get in touch" intro="Call, message or visit us. We're happy to answer your questions." />
      <section className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {cards.map(({ title, Icon, body }) => (
              <li key={title} className="surface flex gap-4 rounded-card p-5">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-control bg-indigo/10 text-indigo">
                  <Icon aria-hidden className="size-6" />
                </span>
                <div>
                  <h2 className="font-semibold">{title}</h2>
                  <div className="mt-1 text-ink-muted">{body}</div>
                </div>
              </li>
            ))}
          </ul>
          <MapEmbed query={school.map_query || place} schoolName={school.name} />
        </Container>
      </section>
    </>
  );
}
