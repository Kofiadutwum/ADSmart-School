import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPlatform } from "@/lib/api";
import { PLATFORM_ICON } from "@/lib/platform-brand";

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
