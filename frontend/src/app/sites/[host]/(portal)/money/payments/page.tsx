import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentsScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return (
    <Suspense>
      <PaymentsScreen />
    </Suspense>
  );
}
