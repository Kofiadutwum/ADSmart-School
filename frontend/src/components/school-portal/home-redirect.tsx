"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor } from "@/lib/school-roles";
import { useActiveRole } from "./school-portal-shell";

/** After sign-in every role lands on its own home screen (Phase 1 spec §1.1(3)). */
export function HomeRedirect() {
  const role = useActiveRole();
  const router = useRouter();
  useEffect(() => {
    router.replace(homeFor(role));
  }, [role, router]);
  return <p className="text-ink-muted">Opening…</p>;
}
