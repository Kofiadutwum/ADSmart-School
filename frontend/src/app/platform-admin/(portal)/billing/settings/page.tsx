import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSettingsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Finance settings" };

export default function Page() {
  return (
    <Suspense>
      <BillingSettingsScreen />
    </Suspense>
  );
}
