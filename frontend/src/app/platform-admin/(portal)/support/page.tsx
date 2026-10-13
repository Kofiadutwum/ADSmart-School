import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformSupportScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Support" };

export default function Page() {
  return (
    <Suspense>
      <PlatformSupportScreen />
    </Suspense>
  );
}
