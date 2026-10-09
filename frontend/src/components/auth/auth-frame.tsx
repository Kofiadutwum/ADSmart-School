import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { ThemeToggle } from "@/components/site/theme-toggle";
import type { ImageData } from "@/lib/types";

type Props = { name: string; logo?: ImageData | null; backToWebsite?: boolean; children: ReactNode };

/** The frame around sign-in and activation: a school's own brand, or the admin area's. */
export function AuthFrame({ name, logo = null, backToWebsite = false, children }: Props) {
  return (
    <div className="bg-brand-mesh flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <div className="on-dark mb-6 text-white">
        <BrandLink name={name} logo={logo} />
      </div>
      <main id="main" className="glass-frosted animate-rise w-full max-w-md rounded-card p-6 shadow-elev-2 sm:p-8">
        {children}
      </main>
      <div className="on-dark mt-6 flex w-full max-w-md flex-wrap items-center justify-between gap-3 text-sm text-white">
        {backToWebsite ? (
          <Link href="/" className="link">
            Back to the website
          </Link>
        ) : (
          <span />
        )}
        <ThemeToggle className="glass-clear" />
      </div>
    </div>
  );
}
