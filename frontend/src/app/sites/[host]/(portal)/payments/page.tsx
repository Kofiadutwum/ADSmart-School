import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentPaymentsScreen } from "@/components/work/family";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return (
    <Suspense>
      <ParentPaymentsScreen />
    </Suspense>
  );
}
