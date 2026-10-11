import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { getPlatform } from "@/lib/api";
import { PLATFORM_LOGO } from "@/lib/platform-brand";
import { ADMIN_NAV } from "@/lib/platform-roles";

export default async function PlatformPortalLayout({ children }: { children: ReactNode }) {
  const { name } = await getPlatform();
  return (
    <AuthProvider>
      <PortalShell name={`${name} admin`} logo={PLATFORM_LOGO} nav={ADMIN_NAV}>
        {children}
      </PortalShell>
    </AuthProvider>
  );
}
