import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentDoneScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Payment" };

export default function Page() {
  return (
    <Suspense>
      <PaymentDoneScreen />
    </Suspense>
  );
}
