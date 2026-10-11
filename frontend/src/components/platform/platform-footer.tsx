import Link from "next/link";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Container } from "@/components/ui/container";

type Props = {
  name: string;
  email: string;
  phone: string;
  phoneDisplay: string;
  hasArticles?: boolean;
  hasFaqs?: boolean;
  whatsapp?: string;
};

export function PlatformFooter({ name, email, phone, phoneDisplay, hasArticles, hasFaqs, whatsapp }: Props) {
  const link = "inline-flex min-h-11 items-center hover:text-indigo";
  return (
    <footer className="border-t border-line bg-card pt-12 pb-24 sm:pb-12">
      <Container className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{name}</p>
          <p className="mt-1 text-ink-muted">Websites and school systems for schools in Ghana.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <Link href="/#get-online" className={link}>Get your school online</Link>
            </li>
            {hasArticles && (
              <li>
                <Link href="/articles" className={link}>Articles and tips</Link>
              </li>
            )}
            {hasFaqs && (
              <li>
                <Link href="/#faq" className={link}>Questions</Link>
              </li>
            )}
            <li>
              <Link href="/privacy" className={link}>Privacy notice</Link>
            </li>
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={link}>
                  Follow on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            )}
            {phone && (
              <li>
                <a href={`tel:${phone}`} className={link}>{phoneDisplay}</a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className={link}>{email}</a>
              </li>
            )}
          </ul>
        </nav>
        <ThemeToggle showLabels className="bg-ink/5" />
      </Container>
      <Container className="mt-8 text-sm text-ink-muted">© {new Date().getFullYear()} {name}.</Container>
    </footer>
  );
}
