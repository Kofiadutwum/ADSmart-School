import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { SchoolPortalShell } from "@/components/school-portal/school-portal-shell";
import { getPortalSite } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { children: ReactNode; params: Promise<{ host: string }> };

export default async function PortalLayout({ children, params }: Props) {
  const { school } = await getPortalSite((await params).host);
  return (
    <AuthProvider>
      <SchoolPortalShell name={school.name} logo={school.logo}>
        {children}
      </SchoolPortalShell>
    </AuthProvider>
  );
}
