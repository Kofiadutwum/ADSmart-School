import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyCareScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Daily care" };

export default function Page() {
  return (
    <Suspense>
      <DailyCareScreen />
    </Suspense>
  );
}
