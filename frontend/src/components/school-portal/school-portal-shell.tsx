"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { inputClasses } from "@/components/site/field";
import { homeFor, navFor, rolesWithScreens } from "@/lib/school-roles";
import type { ImageData } from "@/lib/types";

const STORED = "school-portal-role";
const ActiveRole = createContext<string | null>(null);

/** The role the person is using the portal as (Phase 1 spec §1.1(3), §5.1). */
export function useActiveRole(): string | null {
  return useContext(ActiveRole);
}

function stored(): string | null {
  try {
    return window.localStorage.getItem(STORED);
  } catch {
    return null; // private windows and blocked storage
  }
}

function remember(role: string) {
  try {
    window.localStorage.setItem(STORED, role);
  } catch {
    // the choice simply isn't kept
  }
}

type Props = { name: string; logo?: ImageData | null; children: ReactNode };

/** The school portal frame: pages for the active role, and a switcher for people with several. */
export function SchoolPortalShell({ name, logo = null, children }: Props) {
  const { me } = useAuth();
  const router = useRouter();
  const choices = rolesWithScreens(me.roles);
  const [chosen, setChosen] = useState<string | null>(stored);
  const active = chosen && choices.includes(chosen) ? chosen : (choices[0] ?? null);

  function switchTo(role: string) {
    setChosen(role);
    remember(role);
    router.push(homeFor(role));
  }

  const switcher =
    choices.length > 1 && active ? (
      <label className="block text-sm font-medium">
        Viewing as
        <select
          value={active}
          onChange={(event) => switchTo(event.target.value)}
          className={`${inputClasses} mt-1 min-h-11 py-2`}
        >
          {choices.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <ActiveRole value={active}>
      <PortalShell name={name} logo={logo} nav={navFor(active)} aside={switcher}>
        {children}
      </PortalShell>
    </ActiveRole>
  );
}
