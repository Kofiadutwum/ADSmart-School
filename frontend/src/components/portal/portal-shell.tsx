"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
type Props = {
  name: string;
  logo?: ImageData | null;
  nav?: NavItem[];
  /** Shown above the navigation, e.g. the school portal's role switcher. */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * The signed-in frame (Phase 1 spec §7.5): brand, who is signed in and Sign out on top; the
 * navigation in a glass sidebar on wide screens and in a slide-out menu on phones.
 */
export function PortalShell({ name, logo = null, nav, aside, children }: Props) {
  const { me, signOut } = useAuth();
  const items = nav?.filter((item) => canUse(me, item.roles));
  return (
    <>
      <SkipLink />
      <header className="glass-frosted sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            {items && <MenuButton items={items} aside={aside} />}
            <BrandLink name={name} logo={logo} />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm font-medium md:inline">{me.display_name}</span>
            <Button variant="outline" onClick={signOut} className="px-3">
              <LogOut aria-hidden className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 sm:px-6">
        {items && (
          <aside className="glass-frosted sticky top-20 mt-8 hidden h-fit w-60 shrink-0 space-y-4 rounded-card border border-line p-3 lg:block">
            {aside}
            <NavList items={items} />
          </aside>
        )}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 py-8 outline-none">
          {children}
        </main>
      </div>
    </>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = publicPath(usePathname());
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {items.map((item) => {
          const current = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-control px-3 font-semibold",
                  current ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MenuButton({ items, aside }: { items: NavItem[]; aside?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="press inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-ink/5 lg:hidden"
        >
          <Menu aria-hidden className="size-6" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          className="glass-frosted animate-sheet-in fixed inset-y-0 right-0 z-50 flex w-[min(20rem,88vw)] flex-col gap-4 overflow-y-auto p-4 text-ink shadow-elev-2"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="press inline-flex size-11 cursor-pointer items-center justify-center rounded-control hover:bg-ink/5"
              >
                <X aria-hidden className="size-6" />
              </button>
            </Dialog.Close>
          </div>
          {aside}
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
