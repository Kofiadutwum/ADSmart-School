import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsScreen } from "@/components/work/learning";

export const metadata: Metadata = { title: "Results" };

export default function Page() {
  return (
    <Suspense>
      <ResultsScreen />
    </Suspense>
  );
}
