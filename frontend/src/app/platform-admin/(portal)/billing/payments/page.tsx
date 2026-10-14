import type { Metadata } from "next";
import { Suspense } from "react";
import { BillPaymentsScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return (
    <Suspense>
      <BillPaymentsScreen />
    </Suspense>
  );
}
