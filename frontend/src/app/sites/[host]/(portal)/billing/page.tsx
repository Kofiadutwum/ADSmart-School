import type { Metadata } from "next";
import { Suspense } from "react";
import { SchoolBillingScreen } from "@/components/work/school";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
  return (
    <Suspense>
      <SchoolBillingScreen />
    </Suspense>
  );
}
