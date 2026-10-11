import Link from "next/link";
import { BrandLink } from "@/components/brand/brand-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PLATFORM_LOGO } from "@/lib/platform-brand";

export function PlatformHeader({ name, hasArticles = false }: { name: string; hasArticles?: boolean }) {
  return (
    <header className="glass-frosted fixed inset-x-0 top-0 z-40 text-ink shadow-elev-1">
      <Container className="flex h-18 items-center justify-between gap-3">
        <BrandLink name={name} logo={PLATFORM_LOGO} />
        <nav aria-label="Main" className="flex items-center gap-2">
          {hasArticles && (
            <Link href="/articles" className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold hover:bg-ink/5">
              Articles
            </Link>
          )}
          <ButtonLink href="/#get-online" className="px-4">
            Get online
          </ButtonLink>
        </nav>
      </Container>
    </header>
  );
}
