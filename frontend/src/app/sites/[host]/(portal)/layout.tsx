import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { getSite } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { children: ReactNode; params: Promise<{ host: string }> };

export default async function PortalLayout({ children, params }: Props) {
  const { school } = await getSite((await params).host);
  return (
    <AuthProvider>
      <PortalShell name={school.name} logo={school.logo}>
        {children}
      </PortalShell>
    </AuthProvider>
  );
}
