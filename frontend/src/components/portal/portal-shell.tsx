"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { SkipLink } from "@/components/site/skip-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { publicPath } from "@/lib/hosts";
import { canUse } from "@/lib/platform-roles";
import type { ImageData } from "@/lib/types";
import { useAuth } from "./auth-provider";

/** `roles`: shown only to people holding one of them (platform team; business tools §2). */
export type NavItem = { href: string; label: string; roles?: readonly string[] };
type Props = { name: string; logo?: ImageData | null; nav?: NavItem[]; children: ReactNode };

/** The signed-in frame: brand, navigation, who is signed in and Sign out. */
export function PortalShell({ name, logo = null, nav, children }: Props) {
  const { me, signOut } = useAuth();
  const path = publicPath(usePathname());
  const items = nav?.filter((item) => canUse(me, item.roles));
  return (
    <>
      <SkipLink />
      <header className="glass-frosted sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <BrandLink name={name} logo={logo} />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm font-medium md:inline">{me.display_name}</span>
            <Button variant="outline" onClick={signOut} className="px-3">
              <LogOut aria-hidden className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
        {items && (
          <nav aria-label="Main" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
            {items.map((item) => {
              const current = path === item.href || path.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold",
                    current ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}
