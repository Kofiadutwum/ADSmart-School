import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsitePrivacyScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Page() {
  return (
    <Suspense>
      <WebsitePrivacyScreen />
    </Suspense>
  );
}
