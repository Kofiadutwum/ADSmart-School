import type { Metadata } from "next";
import { Suspense } from "react";
import { FeesScreen } from "@/components/work/money";

export const metadata: Metadata = { title: "Fees" };

export default function Page() {
  return (
    <Suspense>
      <FeesScreen />
    </Suspense>
  );
}
