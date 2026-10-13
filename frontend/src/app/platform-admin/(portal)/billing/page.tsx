import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingOverviewScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
  return (
    <Suspense>
      <BillingOverviewScreen />
    </Suspense>
  );
}
