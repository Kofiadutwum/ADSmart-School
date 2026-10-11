"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/portal/auth-provider";
import { firstAllowedPath } from "@/lib/platform-roles";

/** The admin address opens on the first page the person's roles allow. */
export default function PlatformAdminHome() {
  const { me } = useAuth();
  const router = useRouter();
  useEffect(() => {
    router.replace(firstAllowedPath(me));
  }, [me, router]);
  return <p className="text-ink-muted">Opening…</p>;
}
