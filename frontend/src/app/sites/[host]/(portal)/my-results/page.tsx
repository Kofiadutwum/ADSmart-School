import type { Metadata } from "next";
import { Suspense } from "react";
import { MyResultsScreen } from "@/components/work/pupil";

export const metadata: Metadata = { title: "Results" };

export default function Page() {
  return (
    <Suspense>
      <MyResultsScreen />
    </Suspense>
  );
}
