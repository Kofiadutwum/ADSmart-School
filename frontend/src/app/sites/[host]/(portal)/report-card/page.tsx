import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportCardScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Report card" };

export default function Page() {
  return (
    <Suspense>
      <ReportCardScreen />
    </Suspense>
  );
}
