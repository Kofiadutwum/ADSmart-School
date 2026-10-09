"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { publicPath } from "@/lib/hosts";
import { isActive, NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

type Props = { schoolName: string; portalUrl?: string; className?: string };

export function MobileMenu({ schoolName, portalUrl, className }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = publicPath(usePathname());
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className={cn("press inline-flex size-11 cursor-pointer items-center justify-center rounded-control", className)}
        >
          <Menu aria-hidden className="size-6" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          className="glass-frosted animate-sheet-in fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col gap-6 overflow-y-auto p-6 text-ink shadow-elev-2"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close menu" className="press inline-flex size-11 cursor-pointer items-center justify-center rounded-control hover:bg-ink/5">
                <X aria-hidden className="size-6" />
              </button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-ink-muted">{schoolName}</p>
          <nav aria-label="Mobile">
            <ul className="space-y-1">
              {[{ href: "/", label: "Home" }, ...NAV_ITEMS].map((item) => {
                const active = item.href === "/" ? pathname === "/" : isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center rounded-control px-4 text-lg font-medium",
                        active ? "bg-indigo/10 text-indigo" : "hover:bg-ink/5",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">Theme</p>
            <ThemeToggle showLabels className="bg-ink/5" />
          </div>
          {portalUrl && (
            <ButtonLink href={portalUrl} onClick={close} className="mt-auto">
              Portal sign in
            </ButtonLink>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
