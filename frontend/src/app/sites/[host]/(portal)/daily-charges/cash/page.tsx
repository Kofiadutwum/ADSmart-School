import type { Metadata } from "next";
import { Suspense } from "react";
import { CashScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Cash-ups" };

export default function Page() {
  return (
    <Suspense>
      <CashScreen />
    </Suspense>
  );
}
