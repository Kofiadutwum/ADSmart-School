"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { MobileMenu } from "./mobile-menu";
import { isActive, NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function subscribeToScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}
const isScrolled = () => window.scrollY > 8;
const serverScrolled = () => false;

type Props = { schoolName: string; portalUrl?: string };

export function Header({ schoolName, portalUrl }: Props) {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, serverScrolled);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-x-0 border-t-0",
        scrolled ? "glass-frosted text-ink shadow-elev-1" : "glass-clear on-dark text-white",
      )}
    >
      <Container className="flex h-18 items-center justify-between gap-3">
        <BrandLink name={schoolName} />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                      active && (scrolled ? "bg-indigo/10 text-indigo" : "bg-white/15"),
                      !active && (scrolled ? "hover:bg-ink/5" : "hover:bg-white/10"),
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden lg:block">
            <ThemeToggle className={scrolled ? "bg-ink/5" : "bg-white/10"} />
          </div>
          {portalUrl && (
            <ButtonLink href={portalUrl} variant={scrolled ? "primary" : "glass"} className="px-4">
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Portal sign in</span>
            </ButtonLink>
          )}
          <MobileMenu schoolName={schoolName} portalUrl={portalUrl} className="lg:hidden" />
        </div>
      </Container>
    </header>
  );
}
