import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPlatform } from "@/lib/api";
import { PLATFORM_ICON } from "@/lib/platform-brand";

// Private pages, rendered when opened rather than during the build: the build then doesn't wait
// on the backend for each of them (Render's free plan sleeps, and waking can pass 60 seconds).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getPlatform();
  return {
    title: { default: `${name} admin`, template: `%s · ${name} admin` },
    robots: { index: false, follow: false },
    icons: { icon: PLATFORM_ICON },
  };
}

/** The admin address: the platform team only (amendment §5). */
export default function PlatformAdminLayout({ children }: { children: ReactNode }) {
  return children;
}
