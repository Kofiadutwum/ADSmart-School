import type { Metadata } from "next";
import { Suspense } from "react";
import { BillScreen } from "@/components/work/platform";

export const metadata: Metadata = { title: "Bill" };

export default function Page() {
  return (
    <Suspense>
      <BillScreen />
    </Suspense>
  );
}
