"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { publicPath } from "@/lib/hosts";

/** Counts a visit to each page of the owner's website: the page only, with no cookies or
 * personal details (business tools spec §4). */
export function VisitBeacon() {
  const path = publicPath(usePathname());
  useEffect(() => {
    if (typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon(
      "/api/public/platform/visit",
      new Blob([JSON.stringify({ path })], { type: "application/json" }),
    );
  }, [path]);
  return null;
}
