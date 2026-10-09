import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Container } from "@/components/ui/container";
import { contentOf } from "@/lib/api";
import type { SiteData } from "@/lib/types";
import { NAV_ITEMS } from "./nav";

export function Footer({ site }: { site: SiteData }) {
  const { school } = site;
  const place = [school.address, school.town, school.region].filter(Boolean).join(", ");
  return (
    <footer className="border-t border-line bg-card pt-14 pb-24 sm:pb-14">
      <Container className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="logo-tile">
              <LogoMark className="h-9 w-auto" />
            </span>
            <span className="text-lg font-semibold">{school.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-ink-muted">{contentOf(site, "footer_tagline")}</p>
          {school.motto && <p className="mt-2 italic">“{school.motto}”</p>}
        </div>
        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold tracking-wider text-ink-muted uppercase">Explore</h2>
          <ul className="mt-2">
            {[...NAV_ITEMS, { href: "/privacy", label: "Privacy notice" }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center hover:text-indigo">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-muted uppercase">Contact</h2>
          <address className="mt-3 space-y-2 not-italic">
            <p>{place}</p>
            <p>
              <a className="link inline-flex min-h-11 items-center" href={`tel:${school.phone}`}>
                {school.phone_display}
              </a>
            </p>
            {school.whatsapp_link && (
              <p>
                <a className="link inline-flex min-h-11 items-center" href={school.whatsapp_link} rel="noopener">
                  Chat on WhatsApp
                </a>
              </p>
            )}
            <p>
              <a className="link inline-flex min-h-11 items-center break-all" href={`mailto:${school.email}`}>
                {school.email}
              </a>
            </p>
          </address>
        </div>
      </Container>
      <Container className="mt-10 text-sm text-ink-muted">
        © {new Date().getFullYear()} {school.name}. All rights reserved.
      </Container>
    </footer>
  );
}
