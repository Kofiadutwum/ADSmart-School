import type { Metadata } from "next";
import { Suspense } from "react";
import { ExemptionsScreen } from "@/components/work/daily";

export const metadata: Metadata = { title: "Exemptions" };

export default function Page() {
  return (
    <Suspense>
      <ExemptionsScreen />
    </Suspense>
  );
}
