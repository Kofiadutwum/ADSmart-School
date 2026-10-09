import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getSite } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { children: ReactNode; params: Promise<{ host: string }> };

export default async function AuthLayout({ children, params }: Props) {
  const { school } = await getSite((await params).host);
  return (
    <AuthFrame name={school.name} logo={school.logo} backToWebsite>
      {children}
    </AuthFrame>
  );
}
