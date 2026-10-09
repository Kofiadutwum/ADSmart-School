"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { SkipLink } from "@/components/site/skip-link";
import { Button } from "@/components/ui/button";
import type { ImageData } from "@/lib/types";
import { useAuth } from "./auth-provider";

type Props = { name: string; logo?: ImageData | null; children: ReactNode };

/** The signed-in frame: brand, who is signed in and Sign out. Plans 4 and 5 add navigation. */
export function PortalShell({ name, logo = null, children }: Props) {
  const { me, signOut } = useAuth();
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
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}
