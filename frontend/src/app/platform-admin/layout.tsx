import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPlatform } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getPlatform();
  return {
    title: { default: `${name} admin`, template: `%s · ${name} admin` },
    robots: { index: false, follow: false },
  };
}

/** The admin address: the platform team only (amendment §5). */
export default function PlatformAdminLayout({ children }: { children: ReactNode }) {
  return children;
}
