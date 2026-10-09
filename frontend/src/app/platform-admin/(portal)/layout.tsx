import type { ReactNode } from "react";
import { AuthProvider } from "@/components/portal/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";
import { getPlatform } from "@/lib/api";

export default async function PlatformPortalLayout({ children }: { children: ReactNode }) {
  const { name } = await getPlatform();
  return (
    <AuthProvider>
      <PortalShell name={`${name} admin`}>{children}</PortalShell>
    </AuthProvider>
  );
}
