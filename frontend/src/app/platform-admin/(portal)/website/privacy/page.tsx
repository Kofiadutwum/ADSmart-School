import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteTabs } from "@/components/platform-admin/website/website-tabs";
import { PlatformPrivacyScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Page() {
  return (
    <Suspense>
      <WebsiteTabs />
      <PlatformPrivacyScreen />
    </Suspense>
  );
}
