import type { Metadata } from "next";
import { Suspense } from "react";
import { RatesScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Daily rates" };

export default function Page() {
  return (
    <Suspense>
      <RatesScreen />
    </Suspense>
  );
}
